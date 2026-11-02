from app.retrieval.local_index import IndexChunks
from app.utils import tokenizer
from collections import Counter
import math

class BM25Retriever:
    def __init__(
        self,
        items: list[IndexChunks],
        k1: float = 1.5,
        b: float = 0.75
    ):
        self.items = items
        self.k1 = k1
        self.b = b

        self.documents = [
            tokenizer(
                f"{item.chunk.file_path}"
                f"{item.chunk.content}"
            )
            for item in items
        ]

        self.frequencies = [
            Counter(doc)
            for doc in self.documents
        ]

        self.avg_length = (
            sum(len(doc) for doc in self.documents)
            / len(self.documents)
            if self.documents else 0.0
        )

        self.document_frequencies = Counter()

        for doc in self.documents:
            self.document_frequencies.update(set(doc))

    def search(
        self,
        query: str,
        repository_id: str | None = None,
        limit: int = 5
    ) -> list[tuple[str, float]]:

        if limit <= 0:
            return []

        terms = set(tokenizer(query))
        scores = []
        total_documents = len(self.documents)

        for item, freq, doc in zip(
            self.items,
            self.frequencies,
            self.documents
        ):
            if item.chunk.repository_id != repository_id:
                continue

            score = 0.0
            length = len(doc)

            for term in terms:
                frequency = freq.get(term, 0)

                if frequency == 0:
                    continue

                df = self.document_frequencies[term]

                idf = math.log(
                    1 + (total_documents - df + 0.5) / (df + 0.5)
                )

                denominator = (
                    frequency + self.k1 * (
                        1 - self.b + self.b * length / max(1, self.avg_length)
                    )
                )

                score += idf * (frequency  * (self.k1 + 1)) / denominator

            if score > 0:
                scores.append((item.chunk.file_path, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        # Keep each file only once.
        unique = []
        seen = set()

        for file_path, score in scores:
            if file_path not in seen:
                unique.append((file_path, score))
                seen.add(file_path)

            if len(unique) >= limit:
                break

        return unique
