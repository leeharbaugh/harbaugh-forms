"use client";

import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  CONSENT_ACKNOWLEDGEMENT,
  disclosureDownloadFilename,
  disclosureDownloadText,
  parseDisclosureBlocks,
} from "@/lib/signing/consent-disclosure-view";
import { useEffect, useId, useRef, useState } from "react";

export type DisclosureView = {
  title: string;
  versionKey: string;
  contentSha256: string;
  bodyText: string;
  isProductionReady: boolean;
};

/** The stored disclosure laid out as headings, paragraphs and lists. */
export function DisclosureBody({
  disclosure,
  headingLevel = "h3",
}: {
  disclosure: DisclosureView;
  headingLevel?: "h3" | "h4";
}) {
  const Heading = headingLevel;
  return (
    <div className="space-y-4 text-base leading-relaxed text-foreground" data-testid="disclosure-body">
      {parseDisclosureBlocks(disclosure.bodyText).map((block, index) => (
        <section key={index} className="space-y-1.5">
          {block.heading ? (
            <Heading className="text-base font-semibold">{block.heading}</Heading>
          ) : null}
          {block.paragraphs.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
          {block.bullets.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {block.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** Download (exact stored text, with version and fingerprint) and print. */
export function DisclosureRetentionActions({ disclosure }: { disclosure: DisclosureView }) {
  const download = () => {
    const blob = new Blob([disclosureDownloadText(disclosure)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = disclosureDownloadFilename(disclosure.versionKey);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) return;
    printWindow.opener = null;
    const pre = printWindow.document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.font = "14px/1.5 system-ui, sans-serif";
    pre.textContent = disclosureDownloadText(disclosure);
    printWindow.document.title = disclosure.title;
    printWindow.document.body.appendChild(pre);
    printWindow.focus();
    printWindow.print();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Button type="button" size="sm" variant="outline" onClick={download} data-testid="disclosure-download">
        Download this disclosure
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={print} data-testid="disclosure-print">
        Print
      </Button>
      <span className="text-xs text-muted-foreground" data-testid="disclosure-version">
        Version {disclosure.versionKey}
      </span>
    </div>
  );
}

/**
 * Electronic records and signatures consent. Consent is affirmative: the
 * checkbox starts unchecked and Continue stays disabled until it is checked.
 * Recording consent happens on the server; this only gates the request.
 */
export function ConsentDisclosureCard({
  disclosure,
  reconsent,
  pending,
  onConsent,
}: {
  disclosure: DisclosureView;
  reconsent: boolean;
  pending: boolean;
  onConsent: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const checkboxId = useId();
  const headingId = useId();
  return (
    <Card aria-labelledby={headingId} data-testid="consent-disclosure">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id={headingId}>{disclosure.title}</h2>
        </CardTitle>
        <CardDescription>
          {reconsent
            ? "Please review and accept this disclosure again before you continue."
            : "Please review this before you sign electronically. You can download or print it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!disclosure.isProductionReady ? (
          <Badge variant="secondary">Development disclosure copy</Badge>
        ) : null}
        <DisclosureBody disclosure={disclosure} />
        <DisclosureRetentionActions disclosure={disclosure} />
        <div className="flex items-start gap-3 rounded-md border border-input p-3">
          <AppCheckbox
            id={checkboxId}
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
            disabled={pending}
            data-testid="consent-acknowledge"
            className="mt-0.5"
          />
          <Label htmlFor={checkboxId} className="text-sm font-normal leading-snug">
            {CONSENT_ACKNOWLEDGEMENT}
          </Label>
        </div>
        <Button
          type="button"
          disabled={pending || !acknowledged}
          onClick={onConsent}
          data-testid="consent-continue"
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}

/** Reopen the disclosure this participant accepted, later in the ceremony. */
export function DisclosureReviewButton({ disclosure }: { disclosure: DisclosureView }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const opener = openerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <Button
        ref={openerRef}
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        data-testid="disclosure-review-open"
      >
        Electronic records disclosure
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            role="presentation"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col shadow-lg"
            data-testid="disclosure-review"
          >
            <CardHeader>
              <CardTitle id={titleId} className="text-lg">
                {disclosure.title}
              </CardTitle>
              <CardDescription>The disclosure you accepted for this Signing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              <DisclosureBody disclosure={disclosure} headingLevel="h4" />
              <DisclosureRetentionActions disclosure={disclosure} />
              <div className="flex justify-end">
                <Button ref={closeRef} type="button" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
