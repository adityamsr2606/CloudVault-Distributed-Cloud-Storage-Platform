from prometheus_client import Counter, Histogram

FILE_UPLOADS = Counter(
    "cloudvault_file_uploads_total",
    "Files accepted by the upload API.",
    ["mime_type"],
)
FILE_UPLOAD_BYTES = Counter(
    "cloudvault_file_upload_bytes_total",
    "Bytes accepted by the upload API.",
)
SEARCH_REQUESTS = Counter(
    "cloudvault_semantic_search_requests_total",
    "Semantic and hybrid search requests completed.",
)
SEARCH_LATENCY = Histogram(
    "cloudvault_semantic_search_duration_seconds",
    "End-to-end semantic search latency.",
)
AI_INDEX_JOBS = Counter(
    "cloudvault_ai_index_jobs_total",
    "AI indexing jobs completed by status.",
    ["status"],
)
AI_INDEX_FAILURES = Counter(
    "cloudvault_ai_index_failures_total",
    "AI indexing failures.",
)
AI_INDEX_LATENCY = Histogram(
    "cloudvault_ai_index_duration_seconds",
    "Time spent extracting, embedding, and indexing a file.",
)
