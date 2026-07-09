"use client";

import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone-format";
import { cn } from "@/lib/utils";
import * as React from "react";

export type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string;
  onChange: (value: string) => void;
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={12}
        value={formatPhoneInput(value)}
        onChange={(event) => onChange(formatPhoneInput(event.target.value))}
        className={cn(className)}
        {...props}
      />
    );
  },
);

PhoneInput.displayName = "PhoneInput";
