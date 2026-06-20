import { AppNav } from "@/components/app-nav";

export default function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="collections" />
      <div className="mx-auto flex max-w-5xl flex-col px-5 py-8">{children}</div>
    </main>
  );
}
