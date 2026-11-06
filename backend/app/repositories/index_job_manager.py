import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from uuid import UUID

import httpx

from app.embeddings.ollama import OllamaEmbeddingProvider
from app.repositories.index_jobs import (
    IndexingCancelledError,
    IndexingJob,
    IndexJobStateChangedError,
    IndexJobStore,
)
from app.repositories.index_store import RepositoryIndexStore
from app.repositories.indexer import (
    NoIndexableFilesError,
    RepositoryNotFoundError,
    index_repository,
)
from app.repositories.store import RepositoryStore
from app.utils.helper import RepositoryHasUncommittedChangesError
from app.core import get_settings

logger = logging.getLogger(__name__)

MAX_WORKERS = 1
MAX_QUEUED_JOBS = 4
MAX_ACTIVE_JOBS = MAX_WORKERS + MAX_QUEUED_JOBS

IndexProgress = Callable[[str, int, int], None]
IndexFunction = Callable[..., dict]


class RepositoryIndexJobManager:
    def __init__(
        self,
        db_path: Path | str | None = None,
        index_function: IndexFunction = index_repository,
        embeddings_factory: Callable[[], OllamaEmbeddingProvider] = (
            OllamaEmbeddingProvider
        ),
    ):
        self.db_path = Path(db_path if db_path is not None else get_settings().database_path)
        self.store = IndexJobStore(self.db_path)
        self.index_function = index_function
        self.embeddings_factory = embeddings_factory
        self._executor: ThreadPoolExecutor | None = None
        self._lock = threading.Lock()
        self._cancel_events: dict[UUID, Event] = {}

    def start(self) -> None:
        with self._lock:
            if self._executor is not None:
                return
            self.store.initialize()
            self.store.recover_running()
            self._executor = ThreadPoolExecutor(
                max_workers=MAX_WORKERS,
                thread_name_prefix="repository-index",
            )
            for job in self.store.queued():
                cancel_event = Event()
                self._cancel_events[job.job_id] = cancel_event
                self._executor.submit(self._run, job, cancel_event)

    def shutdown(self) -> None:
        with self._lock:
            executor = self._executor
            self._executor = None
            for cancel_event in self._cancel_events.values():
                cancel_event.set()
        if executor is not None:
            try:
                self.store.interrupt_running()
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

    def enqueue(self, repository_id: UUID) -> IndexingJob:
        with self._lock:
            if self._executor is None:
                raise RuntimeError("Indexing job manager is not running")
            job = self.store.create_queued(
                repository_id,
                capacity=MAX_ACTIVE_JOBS,
            )
            cancel_event = Event()
            self._cancel_events[job.job_id] = cancel_event
            self._executor.submit(self._run, job, cancel_event)
            return job

    def latest(self, repository_id: UUID) -> IndexingJob | None:
        return self.store.latest(repository_id)

    def _run(self, job: IndexingJob, cancel_event: Event) -> None:
        try:
            is_running = self.store.mark_running(job.job_id)
        except Exception:
            logger.error(
                "Could not start repository indexing job %s",
                job.job_id,
            )
            self._fail(
                job.job_id,
                "Repository indexing could not be started.",
            )
            return
        if not is_running:
            with self._lock:
                self._cancel_events.pop(job.job_id, None)
            return

        def report_progress(phase: str, processed: int, total: int) -> None:
            self.store.update_progress(job.job_id, phase, processed, total)

        try:
            self.index_function(
                repository_id=job.repository_id,
                repository_store=RepositoryStore(self.db_path),
                index_store=RepositoryIndexStore(self.db_path),
                embeddings=self.embeddings_factory(),
                progress=report_progress,
                job_id=job.job_id,
                cancel_event=cancel_event,
            )
        except IndexJobStateChangedError:
            return
        except IndexingCancelledError:
            self._fail(
                job.job_id,
                "Indexing was interrupted during server shutdown.",
            )
        except RepositoryNotFoundError:
            self._fail(job.job_id, "Repository not found.")
        except NoIndexableFilesError:
            self._fail(
                job.job_id,
                "No supported source files were found. Add source files or a README.md and retry.",
            )
        except (httpx.TimeoutException, TimeoutError):
            self._fail(job.job_id, "Embedding service timed out.")
        except httpx.HTTPError:
            self._fail(job.job_id, "Embedding service is unavailable.")
        except RepositoryHasUncommittedChangesError as exc:
            self._fail(job.job_id, str(exc))
        except (ValueError, OSError) as exc:
            logger.error(
                "Repository indexing job %s failed with %s",
                job.job_id,
                type(exc).__name__,
            )
            self._fail(
                job.job_id,
                "Repository indexing could not be completed.",
            )
        except Exception:  # Persist unexpected failures instead of leaving jobs running.
            logger.error(
                "Repository indexing job %s failed with an unexpected error",
                job.job_id,
            )
            self._fail(
                job.job_id,
                "Repository indexing failed. Retry the job.",
            )
        else:
            current = self.store.get(job.job_id)
            if current is None or current.status == "failed":
                return
            if current.status == "running":
                completed = self.store.complete(
                    job.job_id,
                    current.total_chunks,
                )
                if not completed:
                    current = self.store.get(job.job_id)
                    if current is None or current.status != "completed":
                        return

        finally:
            with self._lock:
                self._cancel_events.pop(job.job_id, None)

    def _fail(self, job_id: UUID, message: str) -> None:
        if self.store.fail(job_id, message):
            return

        current = self.store.get(job_id)
        if current is not None and current.status in {"queued", "running"}:
            logger.error(
                "Repository indexing job %s could not transition to failed",
                job_id,
            )
