# CloudVault

> Distributed file storage with asynchronous AI retrieval.

CloudVault is a cloud-native storage platform built around secure file ownership, S3-compatible object storage, versioned metadata, asynchronous processing, and hybrid lexical + semantic search.

This repository is under active development. The sections below separate what is implemented from planned work so the project does not claim functionality that is not backed by code.

## Implemented

- FastAPI REST API with JWT access/refresh authentication
- Argon2 password hashing and per-user authorization boundaries
- PostgreSQL metadata model with storage quotas
- MinIO/S3-compatible file upload and download
- Immutable file version records
- Soft delete and restore
- RabbitMQ + Celery asynchronous indexing
- Elasticsearch keyword + vector retrieval
- Sentence Transformers embeddings
- User-scoped semantic search
- Storage summary endpoint
- Prometheus-compatible metrics endpoint
- React + TypeScript authenticated web client
- Docker Compose local stack
- Alembic migrations
- Pytest + Ruff + frontend build checks in GitHub Actions

## AI design

CloudVault does not use a generic chatbot as its AI feature. Uploaded files are indexed asynchronously and represented as embeddings for semantic retrieval. Search combines lexical signals with vector similarity while filtering by the authenticated owner in both retrieval paths.

The current embedding model is configurable and defaults to `sentence-transformers/all-MiniLM-L6-v2`. The next hardening stage adds chunk-level indexing, model/index version metadata, MIME-specific extraction and retrieval evaluation before document Q&A is considered.

## Architecture

```text
React + TypeScript
        |
      Nginx
        |
      FastAPI
      /     \
PostgreSQL  MinIO
        \     |
        RabbitMQ
           |
         Celery
           |
Sentence Transformers
           |
     Elasticsearch
           |
 lexical + vector search

Redis -> task result/cache foundation
Prometheus -> /metrics
```

## Run locally

```bash
cp .env.example .env
# replace SECRET_KEY and MINIO_SECRET_KEY
docker compose up --build
```

Then open:

- Web client: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health
- MinIO console: http://localhost:9001

## Quality checks

```bash
cd backend
ruff check .
pytest
```

```bash
cd frontend
npm install
npm run build
```

GitHub Actions runs these checks on pushes and pull requests.

## Roadmap

The original product scope also includes folder hierarchy, expiring/public sharing, Google OAuth, email verification, password reset, Redis-backed rate limiting, richer activity analytics, Grafana dashboards, multipart uploads, deployment hardening and load testing. These remain roadmap items until implemented and validated.

Planned AI hardening:

- chunk-level document indexing
- PDF/DOCX extraction with explicit MIME handling
- embedding/chunking version tracking
- near-duplicate discovery
- Recall@K, MRR and nDCG retrieval evaluation
- grounded document Q&A only after retrieval quality is measurable

## Author

Aditya Mohan Srivastava
