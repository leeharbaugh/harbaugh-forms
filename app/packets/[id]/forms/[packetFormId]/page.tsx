import { PacketFormEditorPage } from "@/components/packets/packet-form-editor-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packet Form Editor | Harbaugh Forms",
  description: "View and edit field values on a packet form",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; packetFormId: string }>;
}) {
  const { id, packetFormId } = await params;

  return (
    <PacketFormEditorPage
      packetId={Number(id)}
      packetFormId={Number(packetFormId)}
    />
  );
}
