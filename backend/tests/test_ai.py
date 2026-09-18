from app.services.ai import chunk_text, extract_text


def test_text_extraction_for_plain_text():
    data = b"cloud storage architecture"
    assert extract_text("notes.txt", "text/plain", data) == "cloud storage architecture"


def test_chunking_splits_large_text_without_empty_chunks():
    text = " ".join(f"word-{index}" for index in range(1000))
    chunks = chunk_text(text, max_chars=300, overlap=40)

    assert len(chunks) > 1
    assert all(chunk.strip() for chunk in chunks)
    assert all(len(chunk) <= 300 for chunk in chunks)


def test_unsupported_binary_does_not_fabricate_content():
    result = extract_text("archive.zip", "application/zip", b"binary")
    assert result == ""
