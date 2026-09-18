import { useEffect, useRef } from "react";

import { clearProductSettingsCache } from "../config/product";
import { supabase } from "../lib/supabase";

type RealtimeTable =
  | "vault_files"
  | "vault_folders"
  | "activity_events"
  | "share_links"
  | "product_settings";

export function useRealtimeRefresh(
  tables: RealtimeTable[],
  refresh: () => void | Promise<void>,
) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const tablesKey = [...tables].sort().join("|");

  useEffect(() => {
    let active = true;
    let channel = supabase.channel(
      `cloudvault-live-${tablesKey}-${crypto.randomUUID()}`,
    );

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;

      for (const table of tablesKey.split("|") as RealtimeTable[]) {
        const filter =
          table === "product_settings" || !data.user
            ? undefined
            : `owner_id=eq.${data.user.id}`;

        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            ...(filter ? { filter } : {}),
          },
          () => {
            if (table === "product_settings") clearProductSettingsCache();
            void refreshRef.current();
          },
        );
      }

      channel.subscribe();
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [tablesKey]);
}
