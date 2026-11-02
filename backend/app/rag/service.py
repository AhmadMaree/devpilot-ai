from typing import Protocol

from app.rag.models import Citations, QuestionsAnswer
from app.rag.prompts import build_user_propmt
from app.retrieval.local_index import LocalVectorIndex, SearchResult


class EmbeddingProvider(Protocol):
    def embed_texts(
        self, texts: list[str]
    ) -> list[list[float]]: ... 

class ChatProvider(Protocol):
    model : str
    def generate(self, prompt: str) -> str: ...

class RAGServices:

    def __init__(
        self,
        index: LocalVectorIndex,
        embeddings: EmbeddingProvider,
        chat: ChatProvider
    ):
        self.index = index
        self.embeddings= embeddings
        self.chat = chat

    def answer(
        self,
        repository_id: str,
        question: str,
        top_k: int = 5
    ) -> QuestionsAnswer:

        if not repository_id.strip():
            raise ValueError("Repository ID cannot be empty")
        if not question.strip():
            raise ValueError("Question can't be empty")
        if not 1 <= top_k <= 5:
            raise ValueError("top_k is between 1 and 5")

        vectors = self.embeddings.embed_texts([question])

        if len(vectors) != 1 or not vectors[0]:
            raise ValueError("Invalid query embedding")

        results = self.index.serach(
            query_search=vectors[0],
            limit=top_k,
            repo_id=repository_id
        )

        final_results: list[SearchResult] = []
        remaining_chars = 8000

        for result in results:
            size = len(result.chunk.content)

            if size <= remaining_chars:
                final_results.append(result)
                remaining_chars -= size


        if not final_results:
            return QuestionsAnswer(
                answer= (
                    "I could not find sufficient indexed source "
                    "evidence to answer this question."
                ),
                citation= [],
                status="insufficient_evidence",
                model= self.chat.model
            )

        prompt = build_user_propmt(
            question=question,
            results= final_results
        )
        answer = self.chat.generate(prompt)

        citations = [
            Citations(
                chunk_id= res.chunk.chunk_id,
                repository_id=res.chunk.repository_id,
                commit_sha=res.chunk.commit_sha,
                file_path=res.chunk.file_path,
                start_line=res.chunk.start_line,
                end_line= res.chunk.end_line,
                score= res.score
            )
            for res in final_results
        ]

        return QuestionsAnswer(
            answer=answer,
            citation=citations,
            status="completed",
            model=self.chat.model
        )
        
        