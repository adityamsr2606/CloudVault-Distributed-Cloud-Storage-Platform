# CloudVault

> Personal cloud storage with secure file lifecycle management, realtime state, and owner-scoped semantic retrieval.

CloudVault is a full-stack storage platform built around one security rule: **a signed-in user can only discover and access content they own or content explicitly shared with them through a temporary link**.

The repository has two intentional runtime profiles:

- a **free public product profile** using Vercel + Supabase
- a **local distributed-systems profile** using FastAPI, PostgreSQL, MinIO, RabbitMQ, Celery, Redis, Elasticsearch, Prometheus, and Grafana

No benchmark, scale, or retrieval-quality number is claimed unless it has actually been measured.

## Product experience

The public application includes:

- custom CloudVault visual identity
- Light / Dark / System themes
- animated ambient wallpapers with reduced-motion support
- public product landing page
- email/password registration and login
- password recovery
- private per-user vault
- folder hierarchy and nested folders
- file upload and signed download
- SHA-256 exact duplicate prevention
- immutable file versions
- upload-new-version workflow
- restore an older version as a new current version
- starred files
- soft delete, restore, and permanent purge
- configurable expiring share links
- configurable usage-limited share links
- share-link revocation and live usage counters
- realtime file/folder/activity/share/settings updates
- activity audit trail
- semantic search
- related-file intelligence
- Cmd/Ctrl+K command/search surface
- responsive desktop/tablet/mobile navigation

## Free production profile

```text
Browser
  |
React + TypeScript + Vite
  |
Vercel Hobby
  |
Supabase Free
  |-- Auth
  |-- PostgreSQL
  |-- Row Level Security
  |-- Private Storage
  |-- Realtime
  |-- Edge Functions
  |-- pgvector
  +-- built-in gte-small embeddings
```

Core production functionality does not require OpenAI, Gemini, Pinecone, Elasticsearch Cloud, or a paid queue.

Gemini is intentionally optional and disabled by default. Private files are not sent to a generative model merely to make the project look more "AI-enabled".

## Privacy model

Privacy is enforced below React.

### Database isolation

RLS policies scope these resources to `auth.uid()`:

- files
- folders
- file versions
- embedding chunks
- activity events
- share-link management records

### Storage isolation

The private Storage bucket uses paths whose first segment is the authenticated user id. Storage policies verify that path segment before select, insert, update, or delete.

### Semantic retrieval isolation

Both semantic search and related-file retrieval explicitly filter vectors by the current authenticated owner. AI retrieval therefore follows the same access boundary as relational metadata.

### Public sharing

A user must deliberately create a share link for a specific file. Only the token hash is persisted. Public resolution returns a short-lived signed Storage URL. Links can expire, have a usage limit, or be revoked.

## Configurable product policy

Business rules are stored in `public.product_settings`, rather than scattered as component constants.

Configurable settings include:

- upload-size limit
- default/max share expiry
- default/max share uses
- semantic-search result limit
- related-file result limit
- indexable-text byte/character limits
- AI enablement
- sharing enablement
- folders enablement
- versioning enablement
- duplicate-detection enablement
- default theme
- deployment-region label
- AI chunk size and overlap
- signed-link lifetime

The Storage bucket size limit is synchronized from the same configuration.

## Realtime behavior

Supabase Realtime is enabled for state where freshness matters:

- `vault_files`
- `vault_folders`
- `activity_events`
- `share_links`
- `product_settings`

The frontend subscribes only to the tables needed by each page. Expensive semantic-search responses are not streamed unnecessarily.

## AI and intelligent retrieval

The hosted product uses Supabase's built-in `gte-small` embedding model and `pgvector`.

Implemented intelligence:

- semantic query embedding
- permission-aware vector retrieval
- file-level result deduplication
- related-file discovery
- configurable text chunking
- model metadata on indexed chunks
- asynchronous indexing after successful upload/version changes

The AI subsystem is retrieval-focused rather than a generic chatbot.

## Local distributed-systems profile

The Docker Compose profile demonstrates a deeper service architecture:

```text
React
  |
Nginx
  |
FastAPI
  |-------- PostgreSQL
  |-------- MinIO
  |-------- Elasticsearch
  |
RabbitMQ
  |
Celery AI worker
  |
Redis

Prometheus -> Grafana
```

It includes:

- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- MinIO
- RabbitMQ
- Celery
- Redis
- Elasticsearch
- Sentence Transformers
- Prometheus
- Grafana

The API image and AI worker use separate dependency surfaces so the normal API container does not carry the full ML stack.

## Repository structure

```text
CloudVault/
├── backend/
│   ├── app/
│   ├── migrations/
│   └── tests/
├── frontend/
│   └── src/
├── infrastructure/
│   └── monitoring/
├── supabase/
│   ├── functions/
│   └── migrations/
├── docs/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── vercel.json
├── .env.example
└── README.md
```

## Local development

### Full distributed stack

```bash
cp .env.example .env
docker compose up --build
```

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Default services:

| Service | Address |
| --- | --- |
| Web app | http://localhost:8080 |
| FastAPI | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| RabbitMQ management | http://localhost:15672 |
| MinIO console | http://localhost:9001 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for another Supabase deployment.

## Quality gates

GitHub Actions validates:

- Ruff lint
- Ruff formatting
- Pytest backend tests
- Python compile check
- backend Docker image build
- TypeScript/Vite production build
- frontend Docker image build

The workflow result is the source of truth. This README does not invent a passing build, coverage percentage, or performance benchmark.

## Security decisions

- private Storage bucket
- owner-based RLS
- signed object downloads
- hashed share tokens
- atomic share-link usage consumption
- configurable upload limits enforced by Storage and frontend validation
- file names normalized before object-key generation
- SHA-256 exact duplicate detection
- secrets kept outside Git
- public Supabase publishable keys treated as public client identifiers, never service-role secrets

Supabase may expose additional account-level security controls that are configured outside this repository.

## Observability

The local distributed profile exposes Prometheus metrics for storage, semantic search, and AI indexing. The production Supabase profile also exposes realtime state in the UI rather than inventing synthetic telemetry.

## Evaluation and performance

Planned performance targets from the original specification are **targets, not achievements**.

Before adding benchmark claims, measure:

- Recall@K
- Precision@K
- MRR
- nDCG
- p50/p95 search latency
- indexing latency
- indexing throughput
- failure rate
- load-test throughput

## Remaining optional extensions

These are not required for the current product to function:

- Google OAuth 2.0 configuration
- optional Gemini-backed grounded Q&A/summaries with explicit user opt-in
- multipart/resumable upload for very large files
- admin/organization management UI
- automated retrieval benchmark dataset
- measured Locust load-test report
- Kubernetes manifests if a future deployment actually needs Kubernetes

## Cost policy

The hosted architecture targets **$0 recurring subscription cost** using free tiers and open-source software.

Free-tier quotas and provider terms can change. CloudVault should degrade or suspend when a quota is exhausted rather than automatically upgrading to a paid service.

## Author

**Aditya Mohan Srivastava**
