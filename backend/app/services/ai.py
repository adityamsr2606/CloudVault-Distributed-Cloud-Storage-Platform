from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def get_embedding_model():
    # Workers load the model lazily so API startup stays lightweight.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(get_settings().embedding_model)


def embed_text(text: str) -> list[float]:
    model = get_embedding_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def extract_text(filename: str, mime_type: str, data: bytes) -> str:
    if mime_type.startswith("text/"):
        return data.decode("utf-8", errors="ignore")

    # Binary parsers are added MIME-by-MIME instead of pretending arbitrary
    # uploads are safely parseable.
    return f"{filename} {mime_type}"
