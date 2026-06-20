import { SettingsPage } from "@/components/settings/settings-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | Harbaugh Forms",
  description: "Manage default agent and brokerage profile settings",
};

export default function Page() {
  return <SettingsPage />;
}
