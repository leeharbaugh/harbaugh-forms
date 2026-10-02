/**
 * Landing page after a remote participant finishes, declines, or exits.
 *
 * Static copy only: the ceremony session has already ended and its cookies are
 * cleared, so this page reads nothing but the outcome in its query string.
 */
export const SIGNING_CEREMONY_DONE_PATH = "/sign/done" as const;

export type SigningCeremonyExitOutcome = "finished" | "declined" | "exited";

export const SIGNING_CEREMONY_EXIT_COPY: Record<
  SigningCeremonyExitOutcome,
  { title: string; body: string }
> = {
  finished: {
    title: "You finished signing",
    body: "Your signature and initials were recorded. Nothing else is needed from you. Your agent will send the completed documents when every participant has finished.",
  },
  declined: {
    title: "You declined to sign",
    body: "This Signing has ended and your agent has been notified. Nothing else is needed from you.",
  },
  exited: {
    title: "You left the signing session",
    body: "Everything you already completed was saved. Reopen your Signing link and confirm your identity again to continue.",
  },
};

export function parseSigningCeremonyExitOutcome(
  value: unknown,
): SigningCeremonyExitOutcome {
  return value === "finished" || value === "declined" ? value : "exited";
}
