"use client";

import { setAuditLoggingEnabledAction } from "@/app/admin/actions";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { ListPageHeader } from "@/components/list-page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  AuditEventRow,
  AuditSettingsRow,
} from "@/lib/audit/record";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";

type AdminAuditPageProps = {
  settings: AuditSettingsRow | null;
  events: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    dateFrom: string;
    dateTo: string;
    category: string;
    action: string;
    success: string;
    organizationId: string;
  };
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function AdminAuditPage({
  settings,
  events,
  total,
  page,
  pageSize,
  filters,
}: AdminAuditPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingDisable, setPendingDisable] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loggingEnabled = settings?.ordinary_logging_enabled !== false;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [filterForm, setFilterForm] = useState(filters);

  const toggleExpanded = (id: number) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (filterForm.dateFrom) {
      params.set("dateFrom", filterForm.dateFrom);
    }
    if (filterForm.dateTo) {
      params.set("dateTo", filterForm.dateTo);
    }
    if (filterForm.category) {
      params.set("category", filterForm.category);
    }
    if (filterForm.action) {
      params.set("action", filterForm.action);
    }
    if (filterForm.success) {
      params.set("success", filterForm.success);
    }
    if (filterForm.organizationId) {
      params.set("organizationId", filterForm.organizationId);
    }
    params.set("page", "1");
    router.push(`/admin/audit?${params.toString()}`);
  };

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`/admin/audit?${params.toString()}`);
  };

  const onToggleLogging = (enabled: boolean) => {
    if (!enabled) {
      setPendingDisable(true);
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await setAuditLoggingEnabledAction({ enabled: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Ordinary audit logging enabled.");
      router.refresh();
    });
  };

  const categoryOptions = useMemo(() => {
    const values = new Set(events.map((row) => row.event_category));
    return Array.from(values).sort();
  }, [events]);

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDialog
        open={pendingDisable}
        title="Disable ordinary audit logging?"
        message={
          "Mandatory security events will still be recorded, but routine activity (invitations, organization changes, and similar events) will stop being written until logging is re-enabled. This affects compliance visibility."
        }
        confirmLabel="Disable logging"
        confirmingLabel="Disabling…"
        variant="destructive"
        isConfirming={isPending}
        onCancel={() => setPendingDisable(false)}
        onConfirm={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await setAuditLoggingEnabledAction({
              enabled: false,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setPendingDisable(false);
            setMessage("Ordinary audit logging disabled.");
            router.refresh();
          });
        }}
      />

      <AdminSectionNav active="audit" />

      <ListPageHeader
        title="Audit Log"
        description="Review application audit events and control ordinary logging."
      />

      {!loggingEnabled ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Ordinary audit logging is currently <strong>disabled</strong>. Only
          mandatory security events are being recorded.
        </div>
      ) : null}

      {message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Logging settings</CardTitle>
          <CardDescription>
            Ordinary logging captures routine admin and application activity.
            Mandatory events always record regardless of this setting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Ordinary logging:{" "}
              <span className="font-medium">
                {loggingEnabled ? "Enabled" : "Disabled"}
              </span>
            </p>
            <Button
              type="button"
              variant={loggingEnabled ? "destructive" : "default"}
              size="sm"
              disabled={isPending}
              onClick={() => onToggleLogging(!loggingEnabled)}
            >
              {loggingEnabled ? "Disable logging" : "Enable logging"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Last changed: {formatTimestamp(settings?.last_changed_at)} by{" "}
            {settings?.last_changed_by_user_id ? (
              <Link
                href={`/admin/users/${settings.last_changed_by_user_id}`}
                className="underline underline-offset-2"
              >
                user record
              </Link>
            ) : (
              "—"
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filter events</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="audit-date-from">From</Label>
            <Input
              id="audit-date-from"
              type="datetime-local"
              value={filterForm.dateFrom}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  dateFrom: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="audit-date-to">To</Label>
            <Input
              id="audit-date-to"
              type="datetime-local"
              value={filterForm.dateTo}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  dateTo: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="audit-category">Category</Label>
            <Select
              id="audit-category"
              value={filterForm.category}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  category: e.target.value,
                }))
              }
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="audit-action">Action</Label>
            <Input
              id="audit-action"
              value={filterForm.action}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  action: e.target.value,
                }))
              }
              placeholder="Exact action name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="audit-success">Success</Label>
            <Select
              id="audit-success"
              value={filterForm.success}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  success: e.target.value,
                }))
              }
            >
              <option value="">Any</option>
              <option value="true">Success only</option>
              <option value="false">Failures only</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="audit-org">Organization ID</Label>
            <Input
              id="audit-org"
              value={filterForm.organizationId}
              onChange={(e) =>
                setFilterForm((current) => ({
                  ...current,
                  organizationId: e.target.value,
                }))
              }
              placeholder="UUID"
            />
          </div>
          <div className="md:col-span-3">
            <Button type="button" onClick={applyFilters}>
              Apply filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {total} total event{total === 1 ? "" : "s"} · page {page} of{" "}
            {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events found.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-secondary/70 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5">When</th>
                    <th className="px-3 py-2.5">Actor</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="px-3 py-2.5">Summary</th>
                    <th className="px-3 py-2.5">Result</th>
                    <th className="px-3 py-2.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => {
                    const expanded = expandedIds.has(event.id);
                    return (
                      <Fragment key={event.id}>
                        <tr className="align-top">
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {formatTimestamp(event.event_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div>{event.actor_display_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {event.actor_role_snapshot ?? ""}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">{event.event_category}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            {event.action}
                          </td>
                          <td className="px-3 py-2.5">{event.summary}</td>
                          <td className="px-3 py-2.5">
                            {event.success ? "OK" : "Failed"}
                            {event.is_mandatory ? (
                              <div className="text-xs text-muted-foreground">
                                Mandatory
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => toggleExpanded(event.id)}
                            >
                              {expanded ? "Hide" : "Show"}
                            </Button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="bg-muted/30 px-3 py-3"
                            >
                              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">
                                {JSON.stringify(event.metadata ?? {}, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
