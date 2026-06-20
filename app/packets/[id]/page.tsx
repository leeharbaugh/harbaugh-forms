import { PacketDetailPage } from "@/components/packets/packet-detail-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packet Detail | Harbaugh Forms",
  description: "View a generated packet",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const packetId = Number(id);

  return <PacketDetailPage packetId={packetId} />;
}
