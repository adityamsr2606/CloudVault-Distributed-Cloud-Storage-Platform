# AI Retrieval Design

CloudVault uses AI for semantic retrieval rather than as a generic conversational layer.

## Pipeline

1. Supported document text is extracted.
2. Text is normalized and split into overlapping chunks.
3. Chunks are embedded in batches with a Sentence Transformer.
4. Embeddings, lexical text, ownership metadata, file identity, and model version are indexed together.
5. Queries are embedded with the same model.
6. Elasticsearch performs lexical and vector retrieval under an owner filter.
7. Chunk hits are collapsed to file-level results.

## Supported extraction

Current extractors:

- UTF-8-compatible text
- PDF
- DOCX

Unsupported binaries remain searchable using filename/type metadata. CloudVault does not invent text for formats it cannot parse.

## Authorization

Vector retrieval can leak information if access control is applied after candidate retrieval. CloudVault therefore includes `owner_id` as an indexed keyword and applies that filter directly to both search paths.

This rule should remain true when sharing and organization-level access are added: retrieval must operate only over documents the principal is authorized to discover.

## Chunking

The first implementation uses overlapping character windows with whitespace-aware boundaries. This is intentionally simple and measurable.

Future evaluation may compare:

- character windows
- sentence-aware chunking
- section-aware document chunking
- model-specific token windows

The project should choose the method that improves retrieval quality on its own labelled evaluation set rather than whichever technique sounds most sophisticated.

## Evaluation

No accuracy claim is valid without labelled relevance data.

Planned offline evaluation:

```text
query -> relevant file IDs
     -> retrieve top K
     -> Precision@K
     -> Recall@K
     -> MRR
     -> nDCG
```

Operational evaluation also records latency, indexing throughput, queue backlog, failures, and embedding-model version.

## Model changes

Chunks store the embedding model identifier. Replacing the embedding model should be treated as an index migration:

1. create/rebuild compatible vectors,
2. evaluate retrieval quality,
3. switch query embedding and index version together,
4. remove stale vectors only after validation.

Mixing incompatible embedding spaces in one search index is not acceptable.
