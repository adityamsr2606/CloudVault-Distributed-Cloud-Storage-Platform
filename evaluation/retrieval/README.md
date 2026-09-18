# Retrieval evaluation

CloudVault does not claim search quality from intuition.

Create a JSONL file containing real queries and the file IDs that a human considers
relevant:

\`\`\`json
{"query":"database scaling notes","relevant_file_ids":["<file-uuid>"]}
{"query":"receipt for laptop","relevant_file_ids":["<file-uuid>","<file-uuid>"]}
\`\`\`

Then set:

- \`SUPABASE_URL\`
- \`SUPABASE_PUBLISHABLE_KEY\`
- \`CLOUDVAULT_ACCESS_TOKEN\`
- optional \`EVAL_K\` (default 10)

Run:

\`\`\`bash
python evaluation/retrieval/evaluate.py evaluation/retrieval/my_queries.jsonl
\`\`\`

The script reports measured Precision@K, Recall@K, MRR and nDCG@K. Do not publish
numbers until the relevance set is large enough to be meaningful and the test user has
representative indexed files.
