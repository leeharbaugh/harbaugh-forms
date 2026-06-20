import { PacketEditForm } from "@/components/packets/packet-edit-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit Packet | Harbaugh Forms",
  description: "Edit a packet",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const packetId = Number(id);

  return <PacketEditForm packetId={packetId} />;
}
