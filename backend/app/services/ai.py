from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def get_embedding_model():
    # Workers load the model lazily so API startup stays lightweight.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().embedding_model)


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedding_model()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return vectors.tolist()


def chunk_text(text: str, size: int | None = None, overlap: int | None = None) -> list[str]:
    settings = get_settings()
    size = size or settings.chunk_size
    overlap = settings.chunk_overlap if overlap is None else overlap

    if size <= 0:
        raise ValueError("Chunk size must be positive")
    if overlap < 0 or overlap >= size:
        raise ValueError("Chunk overlap must be between 0 and chunk size")

    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    if len(cleaned) <= size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + size, len(cleaned))
        if end < len(cleaned):
            boundary = cleaned.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary

        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(cleaned):
            break
        start = max(end - overlap, start + 1)

    return chunks


def extract_text(filename: str, mime_type: str, data: bytes) -> str:
    if mime_type.startswith("text/"):
        return data.decode("utf-8", errors="ignore")

    # Unsupported binary files remain searchable by metadata. Dedicated parsers
    # are added only when that MIME type has extraction and regression tests.
    return f"{filename} {mime_type}"
