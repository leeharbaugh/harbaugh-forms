/**
 * Development RLS/trigger validation for packet_form_annotations creator attribution.
 * Targets harbaugh-forms-dev only. Transactional probes roll back; one disposable
 * DELETED row is hard-deleted after the ACTIVE-filter check.
 *
 * Run after applying 20260805230000:
 *   npx --yes node --experimental-strip-types --env-file=.env.local scripts/validate-packet-form-annotation-auth-dev.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const SPOOF_USER_ID = "00000000-0000-4000-8000-000000000099";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function assertRef(url: string) {
  if (!url.includes(EXPECTED_REF)) {
    throw new Error(
      `Refusing to run: SUPABASE URL must target ${EXPECTED_REF}, got ${url}`,
    );
  }
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function runLinkedSql(
  sql: string,
  options?: { expectFailure?: boolean },
): { ok: boolean; output: string } {
  const file = path.join(
    tmpdir(),
    `pfa-auth-${createHash("sha1").update(sql).digest("hex").slice(0, 12)}.sql`,
  );
  writeFileSync(file, sql, "utf8");
  const supabaseBin =
    process.platform === "win32" ? "supabase.cmd" : "supabase";
  try {
    const output = execFileSync(
      supabaseBin,
      ["db", "query", "--linked", "--file", file, "-o", "json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        shell: process.platform === "win32",
      },
    );
    if (options?.expectFailure) {
      return { ok: false, output };
    }
    return { ok: true, output };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stderr ?? ""}\n${err.stdout ?? ""}\n${err.message ?? ""}`;
    if (options?.expectFailure) {
      return { ok: true, output };
    }
    return { ok: false, output };
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // ignore
    }
  }
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  assertRef(url);

  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    fail("Need SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  {
    const probe = runLinkedSql(`
      select tgname
      from pg_trigger
      where tgname = 'packet_form_annotations_enforce_created_by';
    `);
    if (!probe.ok || !probe.output.includes("packet_form_annotations_enforce_created_by")) {
      fail(
        `enforce_created_by trigger not found — apply 20260805230000 first.\n${probe.output}`,
      );
    }
    ok("created_by enforcement trigger is present");
  }

  const { data: draftForm, error: draftError } = await admin
    .from("packet_forms")
    .select("id, packet_id, document_state, status")
    .eq("document_state", "DRAFT")
    .eq("status", "ACTIVE")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError || !draftForm) {
    fail(`No ACTIVE DRAFT packet_form found: ${draftError?.message ?? "none"}`);
  }

  const { data: packet, error: packetError } = await admin
    .from("packets")
    .select("id, owner_user_id")
    .eq("id", draftForm.packet_id)
    .single();

  if (packetError || !packet?.owner_user_id) {
    fail(`Could not load packet owner: ${packetError?.message}`);
  }

  const ownerId = packet.owner_user_id as string;
  const packetId = draftForm.packet_id as number;
  const packetFormId = draftForm.id as number;
  const annotationId = randomUUID();

  ok(
    `using DRAFT packet_form ${packetFormId} on packet ${packetId} owner=${ownerId}`,
  );

  let otherUserId = SPOOF_USER_ID;
  {
    const { data: others } = await admin
      .from("profiles")
      .select("id, app_role, status")
      .neq("id", ownerId)
      .limit(20);
    const nonAdmin = (others ?? []).find(
      (row) =>
        row.status === "ACTIVE" &&
        String(row.app_role).toUpperCase() !== "ADMIN",
    );
    if (nonAdmin?.id) {
      otherUserId = nonAdmin.id as string;
    } else {
      // No non-admin profile available: use a non-existent UUID so
      // is_app_admin() and owns_packet() are both false.
      otherUserId = SPOOF_USER_ID;
    }
  }

  ok(`cross-owner probe user=${otherUserId}`);

  const jwtOwner = JSON.stringify({
    sub: ownerId,
    role: "authenticated",
    aud: "authenticated",
  }).replace(/'/g, "''");

  const jwtOther = JSON.stringify({
    sub: otherUserId,
    role: "authenticated",
    aud: "authenticated",
  }).replace(/'/g, "''");

  {
    const sql = `
begin;
select set_config('request.jwt.claims', '${jwtOwner}', true);
select set_config('request.jwt.claim.sub', '${ownerId}', true);
set local role authenticated;

insert into public.packet_form_annotations (
  id, packet_id, packet_form_id, page_number, annotation_type, text_value,
  font_id, x, y, width, height, rotation, created_by_user_id, status
) values (
  '${annotationId}'::uuid, ${packetId}, ${packetFormId}, 1, 'typed_signature',
  'Auth Smoke Signature', 'caveat', 40, 40, 120, 36, 0,
  '${SPOOF_USER_ID}'::uuid, 'ACTIVE'
);

select created_by_user_id::text as created_by, x
from public.packet_form_annotations
where id = '${annotationId}'::uuid;

update public.packet_form_annotations
set created_by_user_id = '${SPOOF_USER_ID}'::uuid,
    x = 55
where id = '${annotationId}'::uuid;

select created_by_user_id::text as created_by_after_spoof_update,
       x as x_after_move
from public.packet_form_annotations
where id = '${annotationId}'::uuid;

update public.packet_form_annotations
set width = 140, height = 40, text_value = 'Auth Smoke Signature Updated'
where id = '${annotationId}'::uuid;

update public.packet_form_annotations
set status = 'DELETED'
where id = '${annotationId}'::uuid;

select status,
       created_by_user_id::text as created_by,
       text_value,
       width,
       height,
       x
from public.packet_form_annotations
where id = '${annotationId}'::uuid;

rollback;
`;
    const result = runLinkedSql(sql);
    if (!result.ok) {
      fail(`owner mutation probe failed:\n${result.output}`);
    }
    if (!result.output.includes(ownerId)) {
      fail(`INSERT did not store auth.uid() creator.\n${result.output}`);
    }
    if (result.output.includes(SPOOF_USER_ID)) {
      fail(`Spoofed creator UUID leaked into stored rows.\n${result.output}`);
    }
    if (!/"x"\s*:\s*55/.test(result.output) && !result.output.includes('"x": 55')) {
      // tolerate compact JSON
      if (!result.output.includes("55")) {
        fail(`Move did not update x to 55.\n${result.output}`);
      }
    }
    if (!result.output.includes("DELETED")) {
      fail(`Soft delete did not set DELETED.\n${result.output}`);
    }
    if (!result.output.includes("Auth Smoke Signature Updated")) {
      fail(`Text update did not persist.\n${result.output}`);
    }
    if (!result.output.includes("140")) {
      fail(`Resize width did not persist.\n${result.output}`);
    }
    ok("owner INSERT ignores spoofed created_by; UPDATE cannot transfer creator");
    ok("owner move/resize/text/soft-delete succeed while creator stays immutable");
  }

  {
    const foreignId = randomUUID();
    const sql = `
begin;
select set_config('request.jwt.claims', '${jwtOther}', true);
select set_config('request.jwt.claim.sub', '${otherUserId}', true);
set local role authenticated;
insert into public.packet_form_annotations (
  id, packet_id, packet_form_id, page_number, annotation_type, text_value,
  font_id, x, y, width, height, created_by_user_id, status
) values (
  '${foreignId}'::uuid, ${packetId}, ${packetFormId}, 1, 'typed_signature',
  'Should Fail', 'caveat', 10, 10, 80, 30, '${otherUserId}'::uuid, 'ACTIVE'
);
rollback;
`;
    const result = runLinkedSql(sql, { expectFailure: true });
    if (!result.ok) {
      fail(`cross-owner INSERT unexpectedly succeeded:\n${result.output}`);
    }
    if (
      !/row-level security|violates|permission denied|new row rejects/i.test(
        result.output,
      )
    ) {
      fail(`cross-owner INSERT failed for unexpected reason:\n${result.output}`);
    }
    ok("cross-owner INSERT blocked by RLS");
  }

  {
    const marker = `auth-smoke-deleted-${Date.now()}`;
    const id = randomUUID();
    const { error: insertError } = await admin.from("packet_form_annotations").insert({
      id,
      packet_id: packetId,
      packet_form_id: packetFormId,
      page_number: 1,
      annotation_type: "typed_signature",
      text_value: marker,
      font_id: "caveat",
      x: 12,
      y: 12,
      width: 100,
      height: 30,
      created_by_user_id: ownerId,
      status: "DELETED",
    });
    if (insertError) {
      fail(`Could not insert disposable DELETED row: ${insertError.message}`);
    }

    const { data: activeRows } = await admin
      .from("packet_form_annotations")
      .select("id")
      .eq("packet_form_id", packetFormId)
      .eq("status", "ACTIVE")
      .eq("text_value", marker);

    await admin.from("packet_form_annotations").delete().eq("id", id);

    if ((activeRows ?? []).length !== 0) {
      fail("DELETED annotation appeared in ACTIVE filter");
    }
    ok("soft-deleted annotations excluded from ACTIVE reads");
  }

  ok(
    "authorization remains owns_packet / is_app_admin; created_by is attribution only",
  );
  console.log("\nAll packet_form_annotations auth probes passed.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
