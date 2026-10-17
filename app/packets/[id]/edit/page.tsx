import { PacketEditForm } from "@/components/packets/packet-edit-form";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Edit Packet | Harbaugh Forms",
  description: "Edit a packet",
};

export const instant = false;

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const packetId = Number(id);

  return <PacketEditForm packetId={packetId} />;
}
