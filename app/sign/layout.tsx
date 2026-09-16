/**
 * Participant Signing entry layout.
 *
 * No ordinary Harbaugh Forms workspace navigation, and no referrer: the entry
 * URL carries a bearer credential as a path segment, so outbound requests from
 * these pages must never disclose it. `next.config.ts` sends the
 * `Referrer-Policy: no-referrer` header for `/sign/:path*`; the meta tag below
 * is defence in depth for cached or statically served responses.
 */
export default function SignEntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <meta name="referrer" content="no-referrer" />
      {children}
    </div>
  );
}
