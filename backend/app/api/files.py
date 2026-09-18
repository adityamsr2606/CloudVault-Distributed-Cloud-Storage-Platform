import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.dependencies import get_current_user
from app.core.metrics import FILE_UPLOAD_BYTES, FILE_UPLOADS
from app.models import FileObject, FileStatus, User
from app.schemas import FileResponse
from app.services.storage import get_storage_service
from app.workers.tasks import index_file

router = APIRouter(prefix="/files", tags=["files"])


@router.get("", response_model=list[FileResponse])
def list_files(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FileObject]:
    return list(
        db.scalars(
            select(FileObject)
            .where(
                FileObject.owner_id == user.id,
                FileObject.deleted_at.is_(None),
            )
            .order_by(FileObject.created_at.desc())
        )
    )


@router.post("", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    upload: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileObject:
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await upload.read(max_bytes + 1)

    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="File exceeds upload limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty files are not accepted")

    used = db.scalar(
        select(func.coalesce(func.sum(FileObject.size_bytes), 0)).where(
            FileObject.owner_id == user.id,
            FileObject.deleted_at.is_(None),
        )
    ) or 0
    if used + len(data) > user.storage_quota_bytes:
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    file_id = uuid.uuid4()
    safe_name = (upload.filename or "file").replace("/", "_").replace("\\", "_")
    object_key = f"{user.id}/{file_id}/{safe_name}"
    digest = hashlib.sha256(data).hexdigest()
    mime_type = upload.content_type or "application/octet-stream"

    get_storage_service().upload_bytes(object_key, data, mime_type)

    record = FileObject(
        id=file_id,
        owner_id=user.id,
        name=safe_name,
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=digest,
        status=FileStatus.UPLOADED,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        get_storage_service().delete(object_key)
        raise

    FILE_UPLOADS.labels(mime_type=mime_type).inc()
    FILE_UPLOAD_BYTES.inc(len(data))
    index_file.delay(str(record.id))
    return record


@router.get("/{file_id}/download")
def download_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    record = db.scalar(
        select(FileObject).where(
            FileObject.id == file_id,
            FileObject.owner_id == user.id,
            FileObject.deleted_at.is_(None),
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")

    data = get_storage_service().download_bytes(record.object_key)
    return Response(
        content=data,
        media_type=record.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{record.name}"'},
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def soft_delete_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    record = db.scalar(
        select(FileObject).where(
            FileObject.id == file_id,
            FileObject.owner_id == user.id,
            FileObject.deleted_at.is_(None),
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="File not found")

    record.deleted_at = datetime.now(timezone.utc)
    record.status = FileStatus.DELETED
    db.commit()
