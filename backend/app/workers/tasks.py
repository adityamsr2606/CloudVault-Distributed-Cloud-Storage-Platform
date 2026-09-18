from uuid import UUID

from celery.utils.log import get_task_logger

from app.core.config import get_settings
from app.database.session import SessionLocal
from app.models import FileObject, FileStatus
from app.services.ai import chunk_text, embed_texts, extract_text
from app.services.search import get_search_service
from app.services.storage import get_storage_service
from app.workers.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def index_file(self, file_id: str) -> None:
    db = SessionLocal()
    file = db.get(FileObject, UUID(file_id))
    if file is None or file.deleted_at is not None:
        db.close()
        return

    try:
        file.status = FileStatus.INDEXING
        db.commit()

        data = get_storage_service().download_bytes(file.object_key)
        text = extract_text(file.name, file.mime_type, data)
        chunks = chunk_text(text) or [file.name]
        embeddings = embed_texts(chunks)

        settings = get_settings()
        search = get_search_service()
        search.ensure_index(dimensions=len(embeddings[0]))
        search.replace_file_chunks(
            str(file.id),
            [
                {
                    "file_id": str(file.id),
                    "owner_id": str(file.owner_id),
                    "chunk_number": number,
                    "index_version": settings.ai_index_version,
                    "name": file.name,
                    "mime_type": file.mime_type,
                    "content": chunk,
                    "embedding": embedding,
                }
                for number, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=True))
            ],
        )

        file.status = FileStatus.READY
        db.commit()
    except Exception:
        file.status = FileStatus.FAILED
        db.commit()
        logger.exception("Failed to index file %s", file_id)
        raise
    finally:
        db.close()
