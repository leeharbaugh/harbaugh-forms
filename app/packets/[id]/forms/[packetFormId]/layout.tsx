export default function PacketFormEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col">{children}</div>
  );
}
