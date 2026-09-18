import hashlib
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db
from app.dependencies import get_current_user
from app.models import FileObject, FileStatus, FileVersion, User
from app.schemas import FileResponse, FileVersionResponse, StorageSummary
from app.services.storage import get_storage_service
from app.workers.tasks import index_file

router = APIRouter(prefix="/files", tags=["files"])


def _owned_file(db: Session, user: User, file_id: uuid.UUID) -> FileObject:
    file = db.scalar(
        select(FileObject).where(
            FileObject.id == file_id,
            FileObject.owner_id == user.id,
        )
    )
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file


def _used_bytes(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.coalesce(func.sum(FileObject.size_bytes), 0)).where(
                FileObject.owner_id == user_id,
                FileObject.deleted_at.is_(None),
            )
        )
        or 0
    )


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


@router.get("/summary", response_model=StorageSummary)
def storage_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StorageSummary:
    files = list(
        db.scalars(
            select(FileObject).where(
                FileObject.owner_id == user.id,
                FileObject.deleted_at.is_(None),
            )
        )
    )
    return StorageSummary(
        used_bytes=sum(item.size_bytes for item in files),
        quota_bytes=user.storage_quota_bytes,
        file_count=len(files),
        ready_count=sum(item.status == FileStatus.READY for item in files),
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

    if not data:
        raise HTTPException(status_code=400, detail="Empty files are not accepted")
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="File exceeds upload limit")
    if _used_bytes(db, user.id) + len(data) > user.storage_quota_bytes:
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    file_id = uuid.uuid4()
    name = upload.filename or "file"
    mime_type = upload.content_type or "application/octet-stream"
    digest = hashlib.sha256(data).hexdigest()
    object_key = f"{user.id}/{file_id}/v1/{name}"

    get_storage_service().upload_bytes(object_key, data, mime_type)

    file = FileObject(
        id=file_id,
        owner_id=user.id,
        name=name,
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=digest,
        version_number=1,
        status=FileStatus.UPLOADED,
    )
    db.add(file)
    db.flush()
    db.add(
        FileVersion(
            file_id=file.id,
            version_number=1,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=digest,
        )
    )
    db.commit()
    db.refresh(file)

    index_file.delay(str(file.id))
    return file


@router.put("/{file_id}", response_model=FileResponse)
async def replace_file(
    file_id: uuid.UUID,
    upload: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileObject:
    file = _owned_file(db, user, file_id)
    if file.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Restore the file before replacing it")

    data = await upload.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty files are not accepted")
    if _used_bytes(db, user.id) - file.size_bytes + len(data) > user.storage_quota_bytes:
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    version = file.version_number + 1
    name = upload.filename or file.name
    mime_type = upload.content_type or "application/octet-stream"
    digest = hashlib.sha256(data).hexdigest()
    object_key = f"{user.id}/{file.id}/v{version}/{name}"

    get_storage_service().upload_bytes(object_key, data, mime_type)

    file.name = name
    file.object_key = object_key
    file.mime_type = mime_type
    file.size_bytes = len(data)
    file.sha256 = digest
    file.version_number = version
    file.status = FileStatus.UPLOADED
    db.add(
        FileVersion(
            file_id=file.id,
            version_number=version,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=digest,
        )
    )
    db.commit()
    db.refresh(file)
    index_file.delay(str(file.id))
    return file


@router.get("/{file_id}/versions", response_model=list[FileVersionResponse])
def versions(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FileVersion]:
    file = _owned_file(db, user, file_id)
    return list(
        db.scalars(
            select(FileVersion)
            .where(FileVersion.file_id == file.id)
            .order_by(FileVersion.version_number.desc())
        )
    )


@router.get("/{file_id}/download")
def download_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    file = _owned_file(db, user, file_id)
    if file.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File not found")

    data = get_storage_service().download_bytes(file.object_key)
    return Response(
        content=data,
        media_type=file.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{file.name}"'},
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    file = _owned_file(db, user, file_id)
    file.deleted_at = datetime.now(UTC)
    file.status = FileStatus.DELETED
    db.commit()


@router.post("/{file_id}/restore", response_model=FileResponse)
def restore_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileObject:
    file = _owned_file(db, user, file_id)
    if file.deleted_at is None:
        return file
    if _used_bytes(db, user.id) + file.size_bytes > user.storage_quota_bytes:
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    file.deleted_at = None
    file.status = FileStatus.UPLOADED
    db.commit()
    db.refresh(file)
    index_file.delay(str(file.id))
    return file
