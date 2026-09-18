from functools import lru_cache
from typing import Any

from elasticsearch import Elasticsearch

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
                    "embedding": {
                        "type": "dense_vector",
                        "dims": dimensions,
                        "index": True,
                        "similarity": "cosine",
                    },
                }
            },
        )

    def index_document(self, document_id: str, body: dict[str, Any]) -> None:
        self.client.index(
            index=self.index,
            id=document_id,
            document=body,
            refresh=False,
        )

    def hybrid_search(
        self,
        owner_id: str,
        query: str,
        vector: list[float],
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        response = self.client.search(
            index=self.index,
            size=limit,
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
                "k": limit,
                "num_candidates": max(50, limit * 5),
                "filter": {"term": {"owner_id": owner_id}},
            },
        )
        return response["hits"]["hits"]


@lru_cache
def get_search_service() -> SearchService:
    return SearchService()
