from functools import lru_cache
from typing import Any

from elasticsearch import Elasticsearch, helpers

from app.core.config import get_settings


class SearchService:
    def __init__(self) -> None:
        settings = get_settings()
        self.index = settings.elasticsearch_index
        self.client = Elasticsearch(settings.elasticsearch_url)

    def ensure_index(self, dimensions: int = 384) -> None:
        if self.client.indices.exists(index=self.index):
            return

        self.client.indices.create(
            index=self.index,
            mappings={
                "properties": {
                    "file_id": {"type": "keyword"},
                    "owner_id": {"type": "keyword"},
                    "name": {"type": "text"},
                    "content": {"type": "text"},
                    "mime_type": {"type": "keyword"},
                    "chunk_index": {"type": "integer"},
                    "embedding_model": {"type": "keyword"},
                    "embedding": {
                        "type": "dense_vector",
                        "dims": dimensions,
                        "index": True,
                        "similarity": "cosine",
                    },
                }
            },
        )

    def replace_file_chunks(
        self,
        file_id: str,
        owner_id: str,
        name: str,
        mime_type: str,
        chunks: list[str],
        embeddings: list[list[float]],
        embedding_model: str,
    ) -> None:
        self.client.delete_by_query(
            index=self.index,
            query={"term": {"file_id": file_id}},
            conflicts="proceed",
            refresh=False,
        )

        actions = []
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
            actions.append(
                {
                    "_index": self.index,
                    "_id": f"{file_id}:{index}",
                    "_source": {
                        "file_id": file_id,
                        "owner_id": owner_id,
                        "name": name,
                        "mime_type": mime_type,
                        "chunk_index": index,
                        "embedding_model": embedding_model,
                        "content": chunk,
                        "embedding": embedding,
                    },
                }
            )

        if actions:
            helpers.bulk(self.client, actions, refresh=False)

    def hybrid_search(
        self,
        owner_id: str,
        query: str,
        vector: list[float],
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        candidate_count = max(50, limit * 8)
        response = self.client.search(
            index=self.index,
            size=candidate_count,
            query={
                "bool": {
                    "should": [
                        {
                            "multi_match": {
                                "query": query,
                                "fields": ["name^3", "content"],
                            }
                        }
                    ],
                    "minimum_should_match": 0,
                    "filter": [{"term": {"owner_id": owner_id}}],
                }
            },
            knn={
                "field": "embedding",
                "query_vector": vector,
                "k": candidate_count,
                "num_candidates": max(100, candidate_count * 2),
                "filter": {"term": {"owner_id": owner_id}},
            },
        )
        return response["hits"]["hits"]


@lru_cache
def get_search_service() -> SearchService:
    return SearchService()
