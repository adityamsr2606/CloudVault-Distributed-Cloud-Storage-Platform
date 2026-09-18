"""Evaluate CloudVault retrieval against a user-curated relevance set.

Dataset format (JSONL):
{"query": "database scaling notes", "relevant_file_ids": ["uuid-1", "uuid-2"]}

No benchmark numbers are hardcoded. The script calls the deployed semantic-search
function and computes metrics only from observed results.
"""

from __future__ import annotations

import json
import math
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def precision_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    if k <= 0:
        return 0.0
    return sum(1 for item in retrieved[:k] if item in relevant) / k


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    if not relevant:
        return 0.0
    return sum(1 for item in retrieved[:k] if item in relevant) / len(relevant)


def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for rank, item in enumerate(retrieved, start=1):
        if item in relevant:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    gains = [1.0 if item in relevant else 0.0 for item in retrieved[:k]]
    dcg = sum(gain / math.log2(index + 2) for index, gain in enumerate(gains))
    ideal_hits = min(len(relevant), k)
    if ideal_hits == 0:
        return 0.0
    idcg = sum(1.0 / math.log2(index + 2) for index in range(ideal_hits))
    return dcg / idcg


def search(query: str, limit: int) -> list[str]:
    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    publishable_key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    access_token = os.environ["CLOUDVAULT_ACCESS_TOKEN"]

    payload = json.dumps({"query": query, "limit": limit}).encode("utf-8")
    request = urllib.request.Request(
        f"{supabase_url}/functions/v1/semantic-search",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": publishable_key,
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Search failed with HTTP {error.code}: {detail}") from error

    return [str(item["file_id"]) for item in body.get("results", [])]


def load_dataset(path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not row.get("query") or not row.get("relevant_file_ids"):
            raise ValueError(f"Invalid dataset row at line {line_number}")
        rows.append(row)
    return rows


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python evaluation/retrieval/evaluate.py <dataset.jsonl>")
        return 2

    path = Path(sys.argv[1])
    k = int(os.getenv("EVAL_K", "10"))
    rows = load_dataset(path)

    metrics = {
        "precision_at_k": [],
        "recall_at_k": [],
        "mrr": [],
        "ndcg_at_k": [],
    }

    for row in rows:
        query = str(row["query"])
        relevant = {str(value) for value in row["relevant_file_ids"]}
        retrieved = search(query, k)

        metrics["precision_at_k"].append(precision_at_k(retrieved, relevant, k))
        metrics["recall_at_k"].append(recall_at_k(retrieved, relevant, k))
        metrics["mrr"].append(reciprocal_rank(retrieved, relevant))
        metrics["ndcg_at_k"].append(ndcg_at_k(retrieved, relevant, k))

    report = {
        "queries": len(rows),
        "k": k,
        "precision_at_k": round(mean(metrics["precision_at_k"]), 6),
        "recall_at_k": round(mean(metrics["recall_at_k"]), 6),
        "mrr": round(mean(metrics["mrr"]), 6),
        "ndcg_at_k": round(mean(metrics["ndcg_at_k"]), 6),
    }

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
