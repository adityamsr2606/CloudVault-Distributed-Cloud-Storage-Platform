from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user
from app.models import User
from app.schemas import SearchHit
from app.services.ai import embed_text
from app.services.search import get_search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[SearchHit])
def search_files(
    q: str = Query(min_length=2, max_length=300),
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
) -> list[SearchHit]:
    vector = embed_text(q)
    hits = get_search_service().hybrid_search(
        owner_id=str(user.id),
        query=q,
        vector=vector,
        limit=limit,
    )

    return [
        SearchHit(
            file_id=hit["_source"]["file_id"],
            name=hit["_source"]["name"],
            score=float(hit["_score"] or 0),
            snippet=(hit["_source"].get("content") or "")[:220] or None,
        )
        for hit in hits
    ]
