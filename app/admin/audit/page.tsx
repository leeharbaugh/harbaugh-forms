import { AdminAuditPage } from "@/components/admin/admin-audit-page";
import { getAuditSettings, listAuditEvents } from "@/lib/audit/record";
import { connection } from "next/server";
import { Suspense } from "react";

async function AdminAuditContent({
  searchParams,
}: {
  searchParams: {
    page?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    action?: string;
    success?: string;
    organizationId?: string;
  };
}) {
  await connection();

  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const successParam = searchParams.success?.trim();
  const successFilter =
    successParam === "true"
      ? true
      : successParam === "false"
        ? false
        : undefined;

  const parseOptionalDate = (raw: string | undefined): string | undefined => {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return undefined;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  };

  const dateFrom = parseOptionalDate(searchParams.dateFrom);
  const dateTo = parseOptionalDate(searchParams.dateTo);

  const [settings, eventResult] = await Promise.all([
    getAuditSettings(),
    listAuditEvents({
      page,
      pageSize: 25,
      dateFrom,
      dateTo,
      eventCategory: searchParams.category?.trim() || undefined,
      action: searchParams.action?.trim() || undefined,
      success: successFilter,
      organizationId: searchParams.organizationId?.trim() || undefined,
    }),
  ]);

  return (
    <AdminAuditPage
      settings={settings}
      events={eventResult.rows}
      total={eventResult.total}
      page={eventResult.page}
      pageSize={eventResult.pageSize}
      filters={{
        dateFrom: searchParams.dateFrom ?? "",
        dateTo: searchParams.dateTo ?? "",
        category: searchParams.category ?? "",
        action: searchParams.action ?? "",
        success: searchParams.success ?? "",
        organizationId: searchParams.organizationId ?? "",
      }}
    />
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    action?: string;
    success?: string;
    organizationId?: string;
  }>;
}) {
  const query = await searchParams;
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">Loading audit log…</p>
      }
    >
      <AdminAuditContent searchParams={query} />
    </Suspense>
  );
}
