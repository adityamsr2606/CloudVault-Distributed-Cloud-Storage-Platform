import io
from functools import lru_cache

from docx import Document
from pypdf import PdfReader

from app.core.config import get_settings

DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@lru_cache
def get_embedding_model():
    # Workers load the model lazily so API startup stays lightweight.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().embedding_model)


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedding_model()
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=min(32, max(1, len(texts))),
    )
    return [vector.tolist() for vector in vectors]


def extract_text(filename: str, mime_type: str, data: bytes) -> str:
    if mime_type.startswith("text/"):
        return data.decode("utf-8", errors="ignore")

    if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    is_docx = mime_type == DOCX_MIME_TYPE or filename.lower().endswith(".docx")
    if is_docx:
        document = Document(io.BytesIO(data))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)

    # Unsupported binaries remain searchable by filename and MIME type without
    # fabricating document content.
    return ""


def chunk_text(text: str, max_chars: int = 1800, overlap: int = 250) -> list[str]:
    clean = " ".join(text.split())
    if not clean:
        return []
    if len(clean) <= max_chars:
        return [clean]

    chunks: list[str] = []
    start = 0

    while start < len(clean):
        end = min(len(clean), start + max_chars)
        if end < len(clean):
            boundary = clean.rfind(" ", start, end)
            if boundary > start + max_chars // 2:
                end = boundary

        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= len(clean):
            break
        start = max(0, end - overlap)

    return chunks
