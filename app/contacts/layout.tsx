import { AppNav } from "@/components/app-nav";

export default function ContactsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <AppNav active="contacts" />
      <div className="mx-auto flex max-w-5xl flex-col px-5 py-8">{children}</div>
    </main>
  );
}
