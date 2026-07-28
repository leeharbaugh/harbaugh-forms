"use client";

import { updatePasswordAction } from "@/app/auth/actions";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UpdatePasswordForm({
  className,
  mode = "reset",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  mode?: "invite" | "reset";
}) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await updatePasswordAction(formData);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
      if (result.redirectTo) {
        router.push(result.redirectTo);
      }
    }
  };

  const title =
    mode === "invite" ? "Create Your Password" : "Reset Your Password";
  const description =
    mode === "invite"
      ? "Choose a password to finish accepting your Harbaugh Forms invitation."
      : "Please enter your new password below.";

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="New password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use at least {MIN_PASSWORD_LENGTH} characters with one letter and
                one number.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Saving…" : "Save password"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Session expired?{" "}
                <Link
                  href="/auth/login"
                  className="underline underline-offset-4"
                >
                  Return to login
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
