/**
 * Participant Signing entry has no ordinary Harbaugh Forms workspace navigation.
 */
export default function SignEntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
