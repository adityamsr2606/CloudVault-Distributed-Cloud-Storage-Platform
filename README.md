<div align="center">

# CloudVault

### Secure, Private and Intelligent Distributed Cloud Storage Platform

**Per-user isolation · Realtime state · File versioning · Secure sharing · Resumable large-file architecture · Hybrid retrieval · Observability · CI/CD**

[![CI](https://github.com/adityamsr2606/CloudVault-Distributed-Cloud-Storage-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/adityamsr2606/CloudVault-Distributed-Cloud-Storage-Platform/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Realtime-3FCF8E?logo=supabase&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker&logoColor=white)
![Backblaze B2](https://img.shields.io/badge/Backblaze%20B2-S3%20Compatible-E21E29)
![Vercel](https://img.shields.io/badge/Deployment-Vercel-000000?logo=vercel&logoColor=white)

**[Live Application](https://cloudvault-distributed-cloud-storag.vercel.app/)**

**[Production Validation](docs/PRODUCTION_VALIDATION.md)** · **[Backblaze B2 Setup](docs/B2_SETUP.md)**

</div>

---

## Overview

CloudVault is a full-stack cloud storage platform focused on **privacy, recoverability, large-object storage, secure sharing, intelligent retrieval, and production engineering**.

It combines a hosted product architecture with a local distributed-systems profile while keeping the same core principles:

- owner-isolated storage
- private object access
- provider-aware file lifecycle
- resumable multipart uploads
- immutable version history
- secure temporary sharing
- realtime state
- permission-aware hybrid retrieval
- MFA and database-level authorization
- CI, testing, observability, and production validation

> **Core security rule:** a signed-in user can discover and access only the data they own unless they deliberately expose a specific file through a controlled temporary share link.

---

## Core Capabilities

<table>
<tr>
<td width="50%" valign="top">

### Storage and Lifecycle

- Private per-user vault
- Nested folders
- Direct + multipart uploads
- Pause, resume, cancel and retry
- Multipart recovery
- Immutable file versions
- Restore older versions
- Starred files
- File and folder Trash
- Provider-aware permanent purge

</td>

<td width="50%" valign="top">

### Security

- Supabase Auth
- TOTP MFA and AAL2
- PostgreSQL Row Level Security
- Private object storage
- Server-side provider credentials
- Signed URLs
- SHA-256 share-token hashing
- Feature-gated passkeys

</td>
</tr>

<tr>
<td width="50%" valign="top">

### Secure Sharing

- Expiring public links
- Usage limits
- Revocation
- Atomic usage counters
- Short-lived signed download URLs
- Provider-aware file resolution

</td>

<td width="50%" valign="top">

### CloudVault Intelligence

- Semantic search
- PostgreSQL full-text search
- pgvector
- `gte-small` embeddings
- Hybrid ranking
- Related-file discovery
- Grounded evidence retrieval
- Optional consent-gated Gemini generation

</td>
</tr>
</table>

---

## Product Experience

CloudVault includes a responsive product interface with:

- Light, Dark and System themes
- desktop, tablet and mobile layouts
- private authenticated workspace
- nested folder navigation
- realtime file and folder updates
- activity history
- Trash and version management
- secure sharing
- CloudVault Intelligence
- route-level lazy loading
- reduced-motion support

---

# Architecture

CloudVault intentionally keeps **two runtime profiles** without mixing their responsibilities.

## Hosted Product Profile

**Vercel + React + TypeScript + Supabase + Backblaze B2**

```mermaid
flowchart TB
    U[Browser / User] --> V[Vercel]
    V --> FE[React + TypeScript + Vite]

    FE --> AUTH[Supabase Auth]
    FE --> RT[Supabase Realtime]
    FE --> EF[Supabase Edge Functions]
    FE --> DB[(Supabase PostgreSQL)]

    DB --> RLS[Row Level Security]
    DB --> PGV[pgvector + PostgreSQL FTS]

    EF --> SS[Private Supabase Storage]
    EF --> B2[Private Backblaze B2<br/>S3-Compatible API]
    EF --> EMB[Supabase gte-small Embeddings]

    PGV --> RET[Hybrid Retrieval]
    EMB --> RET
    RET -. explicit consent + deployment flag .-> GEM[Optional Gemini]
---

# Large-File Storage

CloudVault separates the **product upload ceiling**, **direct-upload limit**, and **large-object provider**.

## Current Runtime Policy

| Setting | Value |
|---|---:|
| Product upload ceiling | 1.5 GiB per file |
| Direct Supabase threshold | 50 MB |
| Large-object provider | Backblaze B2 |
| Multipart part size | 16 MiB |
| Multipart parallelism | 3 |
| Retry attempts per failed part | 4 |

Files at or below the direct threshold use private Supabase Storage. Larger files are routed through the B2 multipart path.

```mermaid
flowchart TD
    FILE[Select file] --> SIZE{Within product limit?}
    SIZE -- No --> REJECT[Reject]
    SIZE -- Yes --> DIRECT{Within direct threshold?}
    DIRECT -- Yes --> SUPA[Private Supabase Storage]
    DIRECT -- No --> SESSION[Create multipart session]
    SESSION --> SIGN[Request signed part URLs]
    SIGN --> B2[Upload parts directly to B2]
    B2 --> COMPLETE[Complete multipart object]
    COMPLETE --> META[Finalize metadata]
---

# CloudVault Intelligence

CloudVault Intelligence is retrieval-first rather than a generic chatbot layer.

Its purpose is to help users discover and understand information inside their own files while preserving the same ownership boundary used by the rest of the platform.

## Retrieval Pipeline

CloudVault combines:

- semantic embeddings
- vector similarity
- PostgreSQL full-text search
- weighted hybrid ranking
- owner-aware filtering
- file-level deduplication

```mermaid
flowchart LR
    Q[User Query] --> EMB[gte-small Embedding]
    Q --> FTS[PostgreSQL Full-Text Search]

    EMB --> VEC[pgvector Similarity]
    VEC --> HYB[Hybrid Ranking]
    FTS --> HYB

    HYB --> OWN[Owner-Scope Enforcement]
    OWN --> DEDUP[Best Match per File]
    DEDUP --> OUT[Search Results / Related Files / Evidence]
---

# Repository Structure

```text
CloudVault-Distributed-Cloud-Storage-Platform/
├── backend/
│   ├── app/
│   ├── migrations/
│   └── tests/
├── frontend/
│   ├── src/
│   └── tests/
├── supabase/
│   ├── functions/
│   └── migrations/
├── evaluation/
├── loadtests/
├── infrastructure/
│   └── monitoring/
├── docs/
│   ├── B2_SETUP.md
│   └── PRODUCTION_VALIDATION.md
├── .github/
│   └── workflows/
├── docker-compose.yml
├── vercel.json
├── .env.example
└── README.md
