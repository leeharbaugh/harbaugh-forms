/**
 * Participant Signing entry layout.
 *
 * No ordinary Harbaugh Forms workspace navigation. Invitation/package entry
 * URLs place only a nonsecret public credential id in the path; the fragment
 * secret is cleared client-side before continuing. `next.config.ts` sends
 * Referrer-Policy / CSP / no-store for `/sign/:path*`; the meta tag below is
 * defence in depth.
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
