from __future__ import annotations

import os

from locust import HttpUser, between, task


class CloudVaultUser(HttpUser):
    wait_time = between(0.4, 1.6)

    def on_start(self) -> None:
        token = os.environ["CLOUDVAULT_ACCESS_TOKEN"]
        api_key = os.environ["SUPABASE_PUBLISHABLE_KEY"]

        self.client.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "apikey": api_key,
                "Content-Type": "application/json",
            }
        )

    @task(5)
    def hybrid_search(self) -> None:
        self.client.post(
            "/functions/v1/semantic-search",
            json={
                "query": "database architecture and scaling",
                "limit": 10,
            },
            name="/functions/v1/semantic-search",
        )

    @task(3)
    def list_files(self) -> None:
        self.client.get(
            "/rest/v1/vault_files?select=id,name,size_bytes,status&deleted_at=is.null&limit=20",
            name="/rest/v1/vault_files",
        )

    @task(1)
    def list_activity(self) -> None:
        self.client.get(
            "/rest/v1/activity_events?select=id,event_type,created_at&order=created_at.desc&limit=20",
            name="/rest/v1/activity_events",
        )
