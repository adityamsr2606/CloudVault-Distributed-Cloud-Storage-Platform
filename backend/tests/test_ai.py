import pytest

from app.services.ai import chunk_text


def test_chunk_text_preserves_short_content():
    assert chunk_text("small document", size=100, overlap=10) == ["small document"]


def test_chunk_text_creates_overlap_without_empty_chunks():
    text = " ".join(f"word{i}" for i in range(120))
    chunks = chunk_text(text, size=120, overlap=20)

    assert len(chunks) > 1
    assert all(chunk.strip() for chunk in chunks)
    assert all(len(chunk) <= 120 for chunk in chunks)


def test_chunk_text_rejects_invalid_overlap():
    with pytest.raises(ValueError):
        chunk_text("content", size=100, overlap=100)
