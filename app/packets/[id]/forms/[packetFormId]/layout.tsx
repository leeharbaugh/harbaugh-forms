export default function PacketFormEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-5 w-auto max-w-none px-5 xl:max-w-7xl">{children}</div>
  );
}
