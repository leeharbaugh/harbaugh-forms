"use client";

import { lookupTrecLicensesAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { AppCheckbox } from "@/components/ui/app-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  compareSponsoringBroker,
  isLicenseExpired,
  isLicenseInGoodStanding,
  parseTrecFullName,
  type TrecLicenseCandidate,
} from "@/lib/trec/normalize";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState, useTransition } from "react";

type VerificationPayload = {
  source: "trec" | "manual";
  licenseType?: string | null;
  reportedFullName?: string | null;
  licenseStatus?: string | null;
  expirationDate?: string | null;
  relatedLicenseNumber?: string | null;
  relatedLicenseName?: string | null;
  lookupAt?: string | null;
  manualOverrideReason?: string | null;
  acknowledgedInactiveLicense?: boolean;
  acknowledgedSponsorshipMismatch?: boolean;
};

type Props = {
  mode: "SALE" | "BRK" | "BOTH";
  initialName?: string;
  initialLicenseNumber?: string;
  appBrokerLicenseNumber?: string | null;
  appBrokerName?: string | null;
  onSelected: (payload: {
    licenseNumber: string;
    verification: VerificationPayload;
    fillNames?: {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      fullName?: string;
    };
  }) => void;
  onClear?: () => void;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function resolveLicenseTypes(
  mode: Props["mode"],
  typeFilter: "SALE" | "BRK" | "BOTH",
): Array<"SALE" | "BRK"> {
  if (mode === "SALE") {
    return ["SALE"];
  }
  if (mode === "BRK") {
    return ["BRK"];
  }
  if (typeFilter === "SALE") {
    return ["SALE"];
  }
  if (typeFilter === "BRK") {
    return ["BRK"];
  }
  return ["SALE", "BRK"];
}

export function TrecLicenseLookup({
  mode,
  initialName = "",
  initialLicenseNumber = "",
  appBrokerLicenseNumber,
  appBrokerName,
  onSelected,
  onClear,
}: Props) {
  const [fullName, setFullName] = useState(initialName);
  const [licenseNumber, setLicenseNumber] = useState(initialLicenseNumber);
  const [typeFilter, setTypeFilter] = useState<"SALE" | "BRK" | "BOTH">("BOTH");
  const [candidates, setCandidates] = useState<TrecLicenseCandidate[]>([]);
  const [lookedUpAt, setLookedUpAt] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] =
    useState<TrecLicenseCandidate | null>(null);
  const [ackInactive, setAckInactive] = useState(false);
  const [ackSponsorship, setAckSponsorship] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualLicenseNumber, setManualLicenseNumber] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [confirmedSelection, setConfirmedSelection] = useState<{
    licenseNumber: string;
    verification: VerificationPayload;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFullName(initialName);
  }, [initialName]);

  useEffect(() => {
    setLicenseNumber(initialLicenseNumber);
  }, [initialLicenseNumber]);

  const sponsorshipMismatch = selectedCandidate
    ? compareSponsoringBroker({
        candidate: selectedCandidate,
        appBrokerLicenseNumber,
        appBrokerName,
      })
    : null;

  const selectedNeedsInactiveAck =
    selectedCandidate != null &&
    (!isLicenseInGoodStanding(selectedCandidate.status) ||
      isLicenseExpired(selectedCandidate.expirationDate));

  const selectedNeedsSponsorshipAck =
    sponsorshipMismatch?.mismatched === true;

  const resetSelection = useCallback(() => {
    setSelectedCandidate(null);
    setAckInactive(false);
    setAckSponsorship(false);
    setConfirmedSelection(null);
    onClear?.();
  }, [onClear]);

  const onSearch = () => {
    setSearchError(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setAckInactive(false);
    setAckSponsorship(false);
    setConfirmedSelection(null);
    setManualMode(false);

    startTransition(async () => {
      const result = await lookupTrecLicensesAction({
        fullName: fullName.trim() || null,
        licenseNumber: licenseNumber.trim() || null,
        licenseTypes: resolveLicenseTypes(mode, typeFilter),
      });

      setLookedUpAt(result.lookedUpAt);

      if (!result.ok) {
        setSearchError(result.error);
        setManualMode(true);
        return;
      }

      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        setSearchError("No matching TREC records found.");
        setManualMode(true);
      }
    });
  };

  const onConfirmTrecSelection = () => {
    if (!selectedCandidate) {
      return;
    }
    if (selectedNeedsInactiveAck && !ackInactive) {
      setSearchError("Acknowledge the inactive or expired license to continue.");
      return;
    }
    if (selectedNeedsSponsorshipAck && !ackSponsorship) {
      setSearchError("Acknowledge the sponsorship mismatch to continue.");
      return;
    }

    const verification: VerificationPayload = {
      source: "trec",
      licenseType: selectedCandidate.licenseType,
      reportedFullName: selectedCandidate.fullName,
      licenseStatus: selectedCandidate.status,
      expirationDate: selectedCandidate.expirationDate,
      relatedLicenseNumber: selectedCandidate.relatedLicenseNumber,
      relatedLicenseName: selectedCandidate.relatedLicenseName,
      lookupAt: lookedUpAt,
      acknowledgedInactiveLicense: selectedNeedsInactiveAck ? ackInactive : undefined,
      acknowledgedSponsorshipMismatch: selectedNeedsSponsorshipAck
        ? ackSponsorship
        : undefined,
    };

    const payload = {
      licenseNumber: selectedCandidate.licenseNumber,
      verification,
      fillNames: parseTrecFullName(selectedCandidate.fullName),
    };

    setConfirmedSelection({
      licenseNumber: selectedCandidate.licenseNumber,
      verification,
    });
    setSearchError(null);
    onSelected(payload);
  };

  const onConfirmManualEntry = () => {
    const trimmedLicense = manualLicenseNumber.trim();
    const trimmedReason = manualReason.trim();
    if (!trimmedLicense) {
      setSearchError("Enter a license number for manual entry.");
      return;
    }
    if (!trimmedReason) {
      setSearchError("A reason is required for manual license entry.");
      return;
    }

    const verification: VerificationPayload = {
      source: "manual",
      manualOverrideReason: trimmedReason,
      lookupAt: lookedUpAt,
    };

    setConfirmedSelection({
      licenseNumber: trimmedLicense,
      verification,
    });
    setSearchError(null);
    onSelected({
      licenseNumber: trimmedLicense,
      verification,
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium">TREC license lookup</p>
        <p className="text-xs text-muted-foreground">
          Search Texas Real Estate Commission records. Select a result manually —
          nothing is applied until you confirm.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="trec-full-name">Full name</Label>
          <Input
            id="trec-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="As listed on TREC"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="trec-license-number">License number</Label>
          <Input
            id="trec-license-number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
          />
        </div>
        {mode === "BOTH" ? (
          <div className="grid gap-2">
            <Label htmlFor="trec-license-type">License type</Label>
            <Select
              id="trec-license-type"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as "SALE" | "BRK" | "BOTH")
              }
            >
              <option value="BOTH">Sales agent &amp; broker</option>
              <option value="SALE">Sales agent (SALE)</option>
              <option value="BRK">Broker (BRK)</option>
            </Select>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label>License type</Label>
            <Input value={mode} disabled readOnly />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} onClick={onSearch}>
          {isPending ? "Searching…" : "Search TREC"}
        </Button>
        {confirmedSelection ? (
          <Button type="button" variant="outline" onClick={resetSelection}>
            Clear selection
          </Button>
        ) : null}
      </div>

      {lookedUpAt ? (
        <p className="text-xs text-muted-foreground">
          Last lookup: {formatTimestamp(lookedUpAt)}
        </p>
      ) : null}

      {searchError ? (
        <p className="text-sm text-destructive">{searchError}</p>
      ) : null}

      {confirmedSelection ? (
        <div className="rounded-md border border-success/40 bg-success/5 p-3 text-sm">
          <p className="font-medium text-success">License confirmed</p>
          <p className="mt-1">
            {confirmedSelection.licenseNumber} (
            {confirmedSelection.verification.source === "trec"
              ? "TREC verified"
              : "Manual entry"}
            )
          </p>
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
          </p>
          <ul className="divide-y rounded-md border border-border">
            {candidates.map((candidate) => {
              const inactive =
                !isLicenseInGoodStanding(candidate.status) ||
                isLicenseExpired(candidate.expirationDate);
              const mismatch = compareSponsoringBroker({
                candidate,
                appBrokerLicenseNumber,
                appBrokerName,
              });
              const isSelected =
                selectedCandidate?.licenseNumberNormalized ===
                candidate.licenseNumberNormalized;

              return (
                <li key={`${candidate.licenseNumberNormalized}-${candidate.licenseType}`}>
                  <button
                    type="button"
                    className={cn(
                      "w-full px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50",
                      isSelected && "bg-muted",
                    )}
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setAckInactive(false);
                      setAckSponsorship(false);
                      setConfirmedSelection(null);
                    }}
                  >
                    <div className="font-medium">{candidate.fullName}</div>
                    <div className="text-muted-foreground">
                      {candidate.licenseNumber} · {candidate.licenseType} ·{" "}
                      {candidate.status || "Unknown status"}
                    </div>
                    {candidate.expirationDate ? (
                      <div className="text-xs text-muted-foreground">
                        Expires {candidate.expirationDate}
                      </div>
                    ) : null}
                    {candidate.relatedLicenseName ||
                    candidate.relatedLicenseNumber ? (
                      <div className="text-xs text-muted-foreground">
                        Related / sponsoring:{" "}
                        {candidate.relatedLicenseName ?? "—"}
                        {candidate.relatedLicenseNumber
                          ? ` (${candidate.relatedLicenseNumber})`
                          : ""}
                      </div>
                    ) : null}
                    {inactive ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Warning: license may be inactive or expired.
                      </p>
                    ) : null}
                    {mismatch.mismatched ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Warning: sponsoring broker (
                        {mismatch.trecRelatedLicenseNumber ?? "unknown"}) does not
                        match organization broker (
                        {mismatch.appBrokerLicenseNumber ?? "not set"}).
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {selectedCandidate && !confirmedSelection ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-sm font-medium">Selected record</p>
          <p className="text-sm">
            {selectedCandidate.fullName} — {selectedCandidate.licenseNumber}
          </p>
          {selectedNeedsInactiveAck ? (
            <label className="flex items-start gap-2 text-sm">
              <AppCheckbox
                checked={ackInactive}
                onCheckedChange={(checked) => setAckInactive(checked === true)}
                aria-label="Acknowledge inactive or expired license"
              />
              <span>
                I acknowledge this license appears inactive or expired and still
                want to use it.
              </span>
            </label>
          ) : null}
          {selectedNeedsSponsorshipAck ? (
            <label className="flex items-start gap-2 text-sm">
              <AppCheckbox
                checked={ackSponsorship}
                onCheckedChange={(checked) =>
                  setAckSponsorship(checked === true)
                }
                aria-label="Acknowledge sponsorship mismatch"
              />
              <span>
                I acknowledge the TREC sponsoring broker does not match this
                organization&apos;s designated broker.
              </span>
            </label>
          ) : null}
          <Button type="button" onClick={onConfirmTrecSelection}>
            Confirm this license
          </Button>
        </div>
      ) : null}

      {!confirmedSelection ? (
        <div className="space-y-3 rounded-md border border-dashed border-border p-3">
          <label className="flex items-start gap-2 text-sm">
            <AppCheckbox
              checked={manualMode}
              onCheckedChange={(checked) => setManualMode(checked === true)}
              aria-label="Enter license manually"
            />
            <span>
              Enter license manually (no TREC match, outage, dataset lag, or
              override)
            </span>
          </label>
          {manualMode ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="manual-license-number">License number</Label>
                <Input
                  id="manual-license-number"
                  value={manualLicenseNumber}
                  onChange={(e) => setManualLicenseNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manual-reason">Reason for manual entry</Label>
                <Textarea
                  id="manual-reason"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Required — e.g. TREC outage, provisional license, admin override"
                />
              </div>
              <Button type="button" variant="outline" onClick={onConfirmManualEntry}>
                Confirm manual license
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
