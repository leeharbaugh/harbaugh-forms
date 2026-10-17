/**
 * Development-only copy of sandboxed Signing emails for manual QA.
 *
 * When the email sandbox accepts a message whose caller opted in, the exact
 * subject and body passed to `sendSigningEmail` are written to
 * `_audit_tmp/signing-email-sandbox/` (gitignored). Nothing is written to the
 * database and delivery results are unchanged. Only link-free messages opt in
 * (cancellation notices); a body that looks like it carries a link or token is
 * refused. Gated like the participant-link QA helper, plus NODE_ENV.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isParticipantLinkQaHelperEnabled } from "./feature-gate";

export const SANDBOX_EMAIL_INSPECTION_DIR = path.join("_audit_tmp", "signing-email-sandbox");

const LINK_OR_TOKEN = /https?:\/\/|\/sign\/|#[A-Za-z0-9_-]{20,}/;

export type SandboxEmailInspection = {
  purpose: "CANCELLATION";
  signingId: string;
  deliveryInstructionId: string;
  attemptNumber: number;
  recipientName: string;
};

export function isSandboxEmailInspectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && isParticipantLinkQaHelperEnabled(env);
}

function safeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "recipient";
}

/** Returns the written path, or null when disabled or refused. Never throws. */
export async function writeSandboxEmailInspection(
  message: { to: string; subject: string; textBody: string },
  inspection: SandboxEmailInspection,
  options: { env?: NodeJS.ProcessEnv; baseDir?: string; now?: Date } = {},
): Promise<string | null> {
  try {
    if (!isSandboxEmailInspectionEnabled(options.env)) return null;
    if (LINK_OR_TOKEN.test(message.textBody) || LINK_OR_TOKEN.test(message.subject)) return null;
    const now = options.now ?? new Date();
    const dir = path.join(options.baseDir ?? process.cwd(), SANDBOX_EMAIL_INSPECTION_DIR);
    const fileName = [
      now.toISOString().replace(/[:.]/g, "-"),
      inspection.purpose.toLowerCase(),
      safeLabel(message.to.split("@")[0] ?? ""),
      inspection.deliveryInstructionId,
      `attempt-${inspection.attemptNumber}`,
    ].join("_") + ".txt";
    const contents = [
      "Development email sandbox copy. This email was NOT sent.",
      `Written: ${now.toISOString()}`,
      `Purpose: ${inspection.purpose}`,
      `Signing: ${inspection.signingId}`,
      `Delivery instruction: ${inspection.deliveryInstructionId}`,
      `Attempt: ${inspection.attemptNumber}`,
      `To: ${inspection.recipientName} <${message.to}>`,
      `Subject: ${message.subject}`,
      "",
      message.textBody,
      "",
    ].join("\n");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, fileName);
    await writeFile(filePath, contents, { encoding: "utf8", flag: "wx" });
    return filePath;
  } catch {
    return null;
  }
}
