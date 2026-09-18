import { supabase } from "../lib/supabase";

export type ProductSettings = {
  id: "default";
  max_upload_bytes: number;
  default_share_expiry_hours: number;
  max_share_expiry_hours: number;
  default_share_max_uses: number;
  max_share_uses: number;
  semantic_search_limit: number;
  related_files_limit: number;
  max_indexable_text_bytes: number;
  max_indexable_text_chars: number;
  ai_enabled: boolean;
  sharing_enabled: boolean;
  folders_enabled: boolean;
  versioning_enabled: boolean;
  duplicate_detection_enabled: boolean;
  default_theme: "light" | "dark" | "system";
  data_region_label: string;
  chunk_size_chars: number;
  chunk_overlap_chars: number;
  share_signed_url_seconds: number;
  storage_provider: "supabase" | "r2";
  large_upload_provider: "supabase" | "r2";
  supabase_direct_upload_max_bytes: number;
  large_upload_threshold_bytes: number;
  multipart_part_size_bytes: number;
  multipart_parallelism: number;
  r2_enabled: boolean;
  passkeys_enabled: boolean;
  mfa_enabled: boolean;
  mfa_required: boolean;
  generative_ai_enabled: boolean;
  generative_ai_provider: "gemini";
  generative_ai_model: string;
  grounded_answer_context_limit: number;
  hybrid_semantic_weight: number;
  hybrid_lexical_weight: number;
  observability_enabled: boolean;
  updated_at: string;
};

const fallbackSettings: ProductSettings = {
  id: "default",
  max_upload_bytes: 1_610_612_736,
  default_share_expiry_hours: 24,
  max_share_expiry_hours: 168,
  default_share_max_uses: 25,
  max_share_uses: 1000,
  semantic_search_limit: 18,
  related_files_limit: 6,
  max_indexable_text_bytes: 2_097_152,
  max_indexable_text_chars: 160_000,
  ai_enabled: true,
  sharing_enabled: true,
  folders_enabled: true,
  versioning_enabled: true,
  duplicate_detection_enabled: true,
  default_theme: "system",
  data_region_label: "Configured deployment region",
  chunk_size_chars: 1400,
  chunk_overlap_chars: 220,
  share_signed_url_seconds: 600,
  storage_provider: "supabase",
  large_upload_provider: "r2",
  supabase_direct_upload_max_bytes: 52_428_800,
  large_upload_threshold_bytes: 52_428_800,
  multipart_part_size_bytes: 16_777_216,
  multipart_parallelism: 3,
  r2_enabled: false,
  passkeys_enabled: false,
  mfa_enabled: true,
  mfa_required: false,
  generative_ai_enabled: false,
  generative_ai_provider: "gemini",
  generative_ai_model: "gemini-3.8-flash",
  grounded_answer_context_limit: 8,
  hybrid_semantic_weight: 0.72,
  hybrid_lexical_weight: 0.28,
  observability_enabled: true,
  updated_at: new Date(0).toISOString(),
};

let cachedSettings: ProductSettings | null = null;
let inFlight: Promise<ProductSettings> | null = null;

export async function getProductSettings({ force = false } = {}) {
  if (cachedSettings && !force) return cachedSettings;
  if (inFlight && !force) return inFlight;

  inFlight = (async () => {
    const { data, error } = await supabase
      .from("product_settings")
      .select("*")
      .eq("id", "default")
      .single();

    if (error || !data) return cachedSettings ?? fallbackSettings;

    cachedSettings = data as ProductSettings;
    return cachedSettings;
  })();

  const result = await inFlight;
  inFlight = null;
  return result;
}

export function clearProductSettingsCache() {
  cachedSettings = null;
  inFlight = null;
}

export function productSettingsFallback() {
  return fallbackSettings;
}

export function formatCapacity(bytes: number) {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
