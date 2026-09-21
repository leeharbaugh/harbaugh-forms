"use server";

import { runSigningWorkerNowWithAppAdmin } from "@/lib/signing/admin-signing-worker";

export async function runSigningWorkerNowAction() {
  try {
    return await runSigningWorkerNowWithAppAdmin();
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to run Signing worker.",
    };
  }
}
