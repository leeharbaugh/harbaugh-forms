"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addressAutocompleteAttr,
  getMapboxAccessToken,
  parseMapboxRetrieveResponse,
  type AddressAutofillSection,
} from "@/lib/mapbox-address";
import type { AddressAutofillRetrieveResponse } from "@mapbox/search-js-core";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

type AddressFieldBinding = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
};

export type AddressAutofillFieldsProps = {
  section?: AddressAutofillSection;
  line1: AddressFieldBinding;
  line2?: AddressFieldBinding;
  city: AddressFieldBinding;
  state: AddressFieldBinding;
  zip: AddressFieldBinding;
  county?: AddressFieldBinding;
  line1Label?: string;
  line2Label?: string;
  disabled?: boolean;
};

type AddressAutofillComponentProps = {
  accessToken: string;
  options?: { country?: string; language?: string };
  onRetrieve?: (response: AddressAutofillRetrieveResponse) => void;
  onSuggestError?: (error: Error) => void;
  children: ReactNode;
};

export function AddressAutofillFields(props: AddressAutofillFieldsProps) {
  const {
    section = "default",
    line1,
    line2,
    city,
    state,
    zip,
    county,
    line1Label = "Address line 1",
    line2Label = "Address line 2",
    disabled = false,
  } = props;

  const accessToken = getMapboxAccessToken();
  const [AddressAutofill, setAddressAutofill] =
    useState<ComponentType<AddressAutofillComponentProps> | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    import("@mapbox/search-js-react")
      .then((module) => {
        if (!cancelled) {
          setAddressAutofill(() => module.AddressAutofill);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAddressAutofill(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleRetrieve = useCallback(
    (response: AddressAutofillRetrieveResponse) => {
      const parsed = parseMapboxRetrieveResponse(response);
      if (!parsed) return;
      if (parsed.line1) line1.onChange(parsed.line1);
      if (parsed.line2 && line2) line2.onChange(parsed.line2);
      if (parsed.city) city.onChange(parsed.city);
      if (parsed.state) state.onChange(parsed.state);
      if (parsed.zip) zip.onChange(parsed.zip);
      if (parsed.county && county) county.onChange(parsed.county);
    },
    [
      line1.onChange,
      line2?.onChange,
      city.onChange,
      state.onChange,
      zip.onChange,
      county?.onChange,
    ],
  );

  const fields = (
    <>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={line1.id}>{line1Label}</Label>
        <Input
          id={line1.id}
          value={line1.value}
          onChange={(event) => line1.onChange(event.target.value)}
          autoComplete={addressAutocompleteAttr(section, "address-line1")}
          disabled={disabled}
          required={line1.required}
        />
      </div>

      {line2 && (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={line2.id}>{line2Label}</Label>
          <Input
            id={line2.id}
            value={line2.value}
            onChange={(event) => line2.onChange(event.target.value)}
            autoComplete={addressAutocompleteAttr(section, "address-line2")}
            disabled={disabled}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={city.id}>{city.label}</Label>
        <Input
          id={city.id}
          value={city.value}
          onChange={(event) => city.onChange(event.target.value)}
          autoComplete={addressAutocompleteAttr(section, "address-level2")}
          disabled={disabled}
          required={city.required}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={state.id}>{state.label}</Label>
        <Input
          id={state.id}
          value={state.value}
          onChange={(event) => state.onChange(event.target.value)}
          autoComplete={addressAutocompleteAttr(section, "address-level1")}
          disabled={disabled}
          maxLength={state.maxLength}
          required={state.required}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={zip.id}>{zip.label}</Label>
        <Input
          id={zip.id}
          value={zip.value}
          onChange={(event) => zip.onChange(event.target.value)}
          autoComplete={addressAutocompleteAttr(section, "postal-code")}
          disabled={disabled}
          required={zip.required}
        />
      </div>

      {county && (
        <div className="space-y-2">
          <Label htmlFor={county.id}>{county.label}</Label>
          <Input
            id={county.id}
            value={county.value}
            onChange={(event) => county.onChange(event.target.value)}
            autoComplete="off"
            disabled={disabled}
          />
        </div>
      )}
    </>
  );

  const fieldGrid = (
    <div className="grid w-full gap-4 sm:grid-cols-2">{fields}</div>
  );

  if (!accessToken || !AddressAutofill) {
    return fieldGrid;
  }

  return (
    <AddressAutofill
      accessToken={accessToken}
      options={{ country: "US", language: "en" }}
      onRetrieve={handleRetrieve}
      onSuggestError={() => {
        // Manual entry remains available when suggestions fail.
      }}
    >
      {fieldGrid}
    </AddressAutofill>
  );
}
