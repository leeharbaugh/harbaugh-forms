import { AppNav } from "@/components/app-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="settings" />
      <div className="mx-auto flex max-w-6xl flex-col px-5 py-8">{children}</div>
    </main>
  );
}
