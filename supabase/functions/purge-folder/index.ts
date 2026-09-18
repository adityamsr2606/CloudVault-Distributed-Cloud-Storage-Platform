import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { DeleteObjectsCommand, S3Client } from "npm:@aws-sdk/client-s3@3.888.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function objectStore(provider: string) {
  if (provider === "b2") {
    const endpoint = Deno.env.get("B2_S3_ENDPOINT");
    const region = Deno.env.get("B2_REGION");
    const accessKeyId = Deno.env.get("B2_APPLICATION_KEY_ID");
    const secretAccessKey = Deno.env.get("B2_APPLICATION_KEY");
    const bucket = Deno.env.get("B2_BUCKET");

    if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("Backblaze B2 is not configured on this deployment.");
    }

    return {
      bucket,
      client: new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }

  if (provider === "r2") {
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("Cloudflare R2 is not configured on this deployment.");
    }

    return {
      bucket,
      client: new S3Client({
        region: "auto",
        endpoint: "https://" + accountId + ".r2.cloudflarestorage.com",
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }

  throw new Error("Unsupported large-object provider.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json();
    const folderId = String(body.folder_id ?? "");
    if (!folderId) return json({ error: "folder_id is required." }, 400);

    const { data: folder, error: folderError } = await supabase
      .from("vault_folders")
      .select("id,name,trash_root_id,deleted_at")
      .eq("id", folderId)
      .not("deleted_at", "is", null)
      .single();

    if (folderError || !folder || folder.trash_root_id !== folderId) {
      return json({ error: "Trashed folder not found." }, 404);
    }

    const { data: files, error: filesError } = await supabase
      .from("vault_files")
      .select("id,storage_path,storage_provider")
      .eq("trashed_by_folder_id", folderId);

    if (filesError) throw filesError;

    const fileIds = (files ?? []).map((file) => String(file.id));
    const versions: Array<{
      file_id: string;
      storage_path: string;
      storage_provider: string;
    }> = [];

    for (const ids of chunk(fileIds, 100)) {
      if (ids.length === 0) continue;
      const { data, error } = await supabase
        .from("file_versions")
        .select("file_id,storage_path,storage_provider")
        .in("file_id", ids);
      if (error) throw error;
      versions.push(...(data ?? []));
    }

    const objects = [
      ...(files ?? []).map((file) => ({
        storage_path: String(file.storage_path),
        storage_provider: String(file.storage_provider),
      })),
      ...versions.map((version) => ({
        storage_path: String(version.storage_path),
        storage_provider: String(version.storage_provider),
      })),
    ];

    const supabasePaths = [
      ...new Set(
        objects
          .filter((item) => item.storage_provider === "supabase")
          .map((item) => item.storage_path),
      ),
    ];

    const objectPaths = [
      ...new Set(
        objects
          .filter((item) => item.storage_provider !== "supabase")
          .map((item) => item.storage_path),
      ),
    ];

    for (const paths of chunk(supabasePaths, 100)) {
      const { error } = await supabase.storage
        .from("cloudvault-files")
        .remove(paths);
      if (error) throw error;
    }

    if (objectPaths.length > 0) {
      const providers = new Map<string, string[]>();
      for (const item of objects.filter((entry) => entry.storage_provider !== "supabase")) {
        const provider = String(item.storage_provider);
        const list = providers.get(provider) ?? [];
        list.push(String(item.storage_path));
        providers.set(provider, list);
      }

      for (const [provider, providerPaths] of providers) {
        const { client, bucket } = objectStore(provider);
        for (const paths of chunk([...new Set(providerPaths)], 1000)) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: paths.map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          );
        }
      }
    }

    for (const ids of chunk(fileIds, 100)) {
      if (ids.length === 0) continue;
      const { error } = await supabase
        .from("vault_files")
        .delete()
        .in("id", ids);
      if (error) throw error;
    }

    const { error: activityError } = await supabase
      .from("activity_events")
      .insert({
        owner_id: authData.user.id,
        file_id: null,
        event_type: "folder_purged",
        detail: {
          folder_id: folderId,
          name: folder.name,
          files: fileIds.length,
        },
      });
    if (activityError) throw activityError;

    const { error: deleteFolderError } = await supabase
      .from("vault_folders")
      .delete()
      .eq("id", folderId);

    if (deleteFolderError) throw deleteFolderError;

    return json({
      ok: true,
      files_deleted: fileIds.length,
      objects_deleted: supabasePaths.length + objectPaths.length,
    });
  } catch (error) {
    console.error("purge-folder failed", error);
    return json(
      { error: error instanceof Error ? error.message : "Folder purge failed." },
      500,
    );
  }
});
