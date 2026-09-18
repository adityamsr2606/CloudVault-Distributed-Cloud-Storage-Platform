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
    hits = get_search_service().hybrid_search(
        owner_id=str(user.id),
        query=q,
        vector=embed_text(q),
        limit=limit,
    )
    return [
        SearchHit(
            file_id=hit["_source"]["file_id"],
            name=hit["_source"]["name"],
            score=float(hit.get("_score") or 0),
            snippet=(hit["_source"].get("content") or "")[:220],
        )
        for hit in hits
    ]
