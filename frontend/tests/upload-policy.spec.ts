import { expect, test } from "@playwright/test";

import { chooseUploadPlan, directUploadCeiling } from "../src/lib/uploadPolicy";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

const baseSettings = {
  max_upload_bytes: 1.5 * GiB,
  supabase_direct_upload_max_bytes: 50 * MiB,
  large_upload_threshold_bytes: 50 * MiB,
  storage_provider: "supabase" as const,
  large_upload_provider: "b2" as const,
};

test("64 MiB routes to B2 multipart", () => {
  expect(chooseUploadPlan(64 * MiB, baseSettings)).toMatchObject({
    provider: "b2",
    mode: "multipart",
    directCeilingBytes: 50 * MiB,
  });
});

test("50 MiB stays direct and one byte above routes to B2", () => {
  expect(chooseUploadPlan(50 * MiB, baseSettings).provider).toBe("supabase");
  expect(chooseUploadPlan(50 * MiB + 1, baseSettings).provider).toBe("b2");
});

test("the lower direct limit wins when settings drift", () => {
  const thresholdTooHigh = { ...baseSettings, large_upload_threshold_bytes: 100 * MiB };
  const directLimitTooHigh = { ...baseSettings, supabase_direct_upload_max_bytes: 100 * MiB };

  expect(directUploadCeiling(thresholdTooHigh)).toBe(50 * MiB);
  expect(chooseUploadPlan(64 * MiB, thresholdTooHigh).provider).toBe("b2");
  expect(directUploadCeiling(directLimitTooHigh)).toBe(50 * MiB);
  expect(chooseUploadPlan(64 * MiB, directLimitTooHigh).provider).toBe("b2");
});

test("1.5 GiB is allowed and larger files are rejected", () => {
  expect(chooseUploadPlan(1.5 * GiB, baseSettings).provider).toBe("b2");
  expect(() => chooseUploadPlan(1.5 * GiB + 1, baseSettings)).toThrow(/upload policy/i);
});
