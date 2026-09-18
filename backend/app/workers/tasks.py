from time import perf_counter
from uuid import UUID

from celery.utils.log import get_task_logger

from app.core.config import get_settings
from app.core.metrics import AI_INDEX_FAILURES, AI_INDEX_JOBS, AI_INDEX_LATENCY
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

    started = perf_counter()

    try:
        file.status = FileStatus.INDEXING
        db.commit()

        data = get_storage_service().download_bytes(file.object_key)
        extracted = extract_text(file.name, file.mime_type, data)
        chunks = chunk_text(extracted)

        # Files with no extractable body are still searchable by name/type.
        if not chunks:
            chunks = [f"{file.name} {file.mime_type}"]

        embeddings = embed_texts(chunks)
        settings = get_settings()

        search = get_search_service()
        search.ensure_index(dimensions=len(embeddings[0]))
        search.replace_file_chunks(
            file_id=str(file.id),
            owner_id=str(file.owner_id),
            name=file.name,
            mime_type=file.mime_type,
            chunks=chunks,
            embeddings=embeddings,
            embedding_model=settings.embedding_model,
        )

        file.status = FileStatus.READY
        db.commit()
        AI_INDEX_JOBS.labels(status="success").inc()
    except Exception:
        file.status = FileStatus.FAILED
        db.commit()
        AI_INDEX_FAILURES.inc()
        AI_INDEX_JOBS.labels(status="failed").inc()
        logger.exception("Failed to index file %s", file_id)
        raise
    finally:
        AI_INDEX_LATENCY.observe(perf_counter() - started)
        db.close()
