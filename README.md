# CloudVault

> Distributed cloud storage with secure object persistence, asynchronous processing, and tenant-scoped semantic retrieval.

CloudVault is a full-stack storage platform built to explore the engineering problems behind modern cloud-drive products: durable object storage, metadata consistency, authentication, background work, search, observability, containerized deployment, and AI-assisted retrieval.

The repository is being implemented incrementally. The sections below distinguish what exists in code today from the broader roadmap so the project does not claim features that have not been built or measured.

## Free production deployment

CloudVault has two intentional runtime profiles.

### Public deployment — $0 subscription target

The public web application is designed to stay within free managed tiers:

```text
Vercel Hobby
    |
React + TypeScript + Vite
    |
Supabase Free
    |-- Auth
    |-- Postgres + RLS
    |-- Storage
    |-- pgvector
    |-- Edge Functions
    +-- built-in gte-small embeddings
```

This production profile avoids paid AI APIs and paid vector databases. Semantic retrieval uses Supabase's built-in `gte-small` model and `pgvector`. File objects stay in a private Storage bucket and are served through short-lived signed URLs.

The application intentionally does not require OpenAI, Pinecone, Elasticsearch Cloud, a paid queue, or another subscription to remain functional. If a free-tier quota is exhausted, the expected behavior is service degradation or suspension rather than automatically creating a paid bill.

### Local distributed-systems profile

The Docker Compose stack remains in the repository because it demonstrates a deeper SDE/system-design architecture:

- FastAPI API layer
- PostgreSQL metadata
- MinIO object storage
- RabbitMQ + Celery background processing
- Redis task results
- Elasticsearch hybrid search
- Prometheus + Grafana observability

The two profiles solve different problems: the public profile optimizes for a genuinely free live demo; the local profile demonstrates distributed-system boundaries and operational engineering.

### Production product surface

The public web application now includes:

- Overview dashboard
- My Vault file browser
- folders
- starred files
- semantic Intelligence search
- secure expiring share links
- activity audit trail
- trash and restore
- settings/system status
- responsive mobile navigation
- animated live background with reduced-motion support
- contextual hover actions for common file operations

## Current implementation

### Identity and access

- Email/password registration and login
- Argon2 password hashing
- JWT access and refresh tokens
- Authenticated API dependencies
- User roles represented in the data model
- Per-user storage quotas

### File storage

- Authenticated file upload and download
- MinIO-backed S3-compatible object storage
- PostgreSQL file metadata
- SHA-256 content fingerprints
- Upload-size validation
- Storage quota enforcement
- Immutable file-version records
- File replacement with version history
- Soft deletion and restore
- Storage summary endpoint
- Compensating object deletion when metadata persistence fails

### AI retrieval

- Sentence Transformer embeddings
- Text, PDF, and DOCX extraction
- Overlapping document chunking
- Batch embedding generation
- Elasticsearch dense-vector indexing
- Hybrid lexical + vector retrieval
- Per-user authorization filters inside retrieval
- File-level result deduplication
- Asynchronous indexing through Celery and RabbitMQ
- Embedding-model metadata stored with indexed chunks

The AI subsystem is intentionally retrieval-focused. It is not a generic chatbot. Files are transformed into searchable semantic representations so users can find relevant documents by meaning while authorization remains enforced at search time.

### Platform engineering

- FastAPI backend
- SQLAlchemy data model
- Alembic migrations
- React + TypeScript frontend
- Tailwind CSS
- Nginx frontend container
- PostgreSQL
- Redis
- RabbitMQ
- MinIO
- Elasticsearch
- Prometheus
- Grafana
- Docker Compose
- GitHub Actions CI definition
- Pytest and Ruff quality configuration

## Architecture

```text
                           Browser
                              |
                      React + TypeScript
                              |
                            Nginx
                              |
                           FastAPI
                _____________|_____________
               |             |             |
          PostgreSQL       MinIO       Elasticsearch
          metadata        objects      hybrid search
               |             ^             ^
               |             |             |
               +------ RabbitMQ -----------+
                         |
                    Celery worker
                         |
              extraction -> chunking
                         |
                 sentence embeddings

                    Redis task backend

             Prometheus -> Grafana
```

### Upload path

```text
Client
  -> FastAPI validates authentication, size, and quota
  -> object written to MinIO
  -> metadata committed to PostgreSQL
  -> indexing task published
  -> request returns

Celery worker
  -> downloads object
  -> extracts supported document text
  -> chunks content
  -> generates embeddings in batches
  -> replaces file chunks in Elasticsearch
  -> marks file search-ready
```

AI work is kept outside the synchronous upload request so model latency does not make storage availability depend on embedding generation.

### Search path

```text
query
  -> query embedding
  -> lexical match + vector kNN
  -> owner_id filter applied to both retrieval paths
  -> rank candidates
  -> keep highest-scoring chunk for each file
  -> return file results
```

## Repository structure

```text
CloudVault/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── database/
│   │   ├── services/
│   │   └── workers/
│   ├── migrations/
│   └── tests/
├── frontend/
│   └── src/
├── infrastructure/
│   └── monitoring/
├── supabase/
│   ├── functions/
│   └── migrations/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── vercel.json
├── .env.example
└── README.md
```

The structure is deliberately compact. New folders are added only when the implementation needs them.

## Local development

### Requirements

- Docker Desktop with Docker Compose
- Enough memory for Elasticsearch and the embedding worker

### Start the platform

```bash
cp .env.example .env
docker compose up --build
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Default local services:

| Service | Address |
| --- | --- |
| Web app | http://localhost:8080 |
| FastAPI | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| RabbitMQ management | http://localhost:15672 |
| MinIO console | http://localhost:9001 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

Change the example secrets before using the stack outside an isolated local environment.

## API surface implemented

```text
GET    /health
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/files
GET    /api/v1/files/summary
POST   /api/v1/files
PUT    /api/v1/files/{file_id}
GET    /api/v1/files/{file_id}/versions
GET    /api/v1/files/{file_id}/download
DELETE /api/v1/files/{file_id}
POST   /api/v1/files/{file_id}/restore
GET    /api/v1/search?q=...
GET    /metrics
```

## Quality gates

The repository contains checks for:

- Python linting and formatting with Ruff
- Backend unit/API tests with Pytest
- Backend coverage reporting
- Frontend TypeScript build
- Backend and frontend container builds
- Database migrations instead of implicit schema creation

GitHub Actions runs backend lint/format/tests/container checks and frontend typecheck/build/container checks. The repository does not invent a passing build or coverage percentage; workflow results are treated as the source of truth.

## Observability

CloudVault exposes Prometheus metrics including:

- `cloudvault_file_uploads_total`
- `cloudvault_file_upload_bytes_total`
- `cloudvault_semantic_search_requests_total`
- `cloudvault_semantic_search_duration_seconds`
- `cloudvault_ai_index_jobs_total`
- `cloudvault_ai_index_failures_total`
- `cloudvault_ai_index_duration_seconds`

These allow AI indexing to be operated like a real production subsystem instead of an invisible model call.

## Security decisions already enforced

- Passwords are hashed rather than encrypted or stored in plaintext.
- File APIs always scope records to the authenticated owner.
- Elasticsearch retrieval carries the same owner boundary as relational lookups.
- File names are normalized before generating object keys.
- Upload limits and quotas are checked server-side.
- The frontend never receives MinIO credentials.
- Secrets are represented through environment variables and excluded from Git.

A future security milestone will add refresh-token revocation/rotation, rate limiting, email verification, OAuth, signed sharing links, stricter content validation, and deployment-specific TLS/security headers.

## AI evaluation plan

Semantic retrieval will not be advertised with invented accuracy numbers. Before benchmark claims are added, the project will use a labelled query-to-document relevance set and measure metrics such as:

- Recall@K
- Precision@K
- Mean Reciprocal Rank
- nDCG
- p50/p95 search latency
- indexing throughput
- indexing failure rate

## Roadmap

The original product specification is broader than the first working milestone. Still to be implemented:

- Google OAuth 2.0
- email verification and password reset
- persisted refresh-token rotation/revocation
- explicit admin RBAC endpoints
- folders
- permanent purge workflow and retention policy
- private/public sharing links
- multipart uploads for very large objects
- Redis response caching and rate limiting
- activity/audit log
- storage/download analytics
- near-duplicate suggestions
- related-file recommendations
- retrieval evaluation harness
- load tests and measured performance targets
- Grafana dashboard provisioning
- hardened production deployment and TLS
- Kubernetes manifests only if the deployment actually needs Kubernetes

## Reference documentation

Implementation choices are grounded primarily in official project documentation:

- FastAPI: https://fastapi.tiangolo.com/
- SQLAlchemy: https://docs.sqlalchemy.org/
- Alembic: https://alembic.sqlalchemy.org/
- Elasticsearch vector search: https://www.elastic.co/docs/solutions/search/vector
- Sentence Transformers: https://www.sbert.net/
- Celery: https://docs.celeryq.dev/
- MinIO Python SDK: https://min.io/docs/minio/linux/developers/python/minio-py.html
- Prometheus: https://prometheus.io/docs/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

## Author

**Aditya Mohan Srivastava**


## Design direction

CloudVault does not copy another product's visual identity. The interface uses current product-design patterns as references: calm hierarchy and consistent navigation, search-first content access, contextual hover actions, desktop-like responsiveness, and motion that supports orientation rather than decoration.

## Cost policy

The hosted project is intentionally built around free/open-source technologies. No recurring paid subscription is required by the architecture itself. Free-tier providers can change quotas or product terms over time, so the live deployment should be periodically reviewed against current limits before relying on it for production workloads.
