"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export function FieldModelGuidePage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Field model</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Form fields are split across reusable definitions, template placement,
          and packet-specific values. The old &ldquo;field mappings&rdquo; screen
          that connected forms to data sources has been replaced by this model.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where to work</CardTitle>
          <CardDescription>
            Use the screen that matches what you want to change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border p-4">
            <p className="font-medium">Fields</p>
            <p className="mt-1 text-muted-foreground">
              Reusable business field definitions (key, label, type, defaults).
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/forms/fields">Open Fields</Link>
            </Button>
          </div>

          <div className="rounded-md border p-4">
            <p className="font-medium">Template placement</p>
            <p className="mt-1 text-muted-foreground">
              Default PDF position for each field on a form template (
              <code className="text-xs">form_field_mappings</code>). Affects all
              future packets using that template.
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/forms">Open form templates</Link>
            </Button>
          </div>

          <div className="rounded-md border p-4">
            <p className="font-medium">Packet form values &amp; placement</p>
            <p className="mt-1 text-muted-foreground">
              Per-packet values live in <code className="text-xs">field_instances</code>.
              Per-packet placement overrides live in{" "}
              <code className="text-xs">field_instance_mappings</code>. Open a
              generated packet and use Fill form on an internal template form.
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/">Open packets</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
