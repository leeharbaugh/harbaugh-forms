import { PacketDetailPage } from "@/components/packets/packet-detail-page";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Packet Detail | Harbaugh Forms",
  description: "View a generated packet",
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

  return <PacketDetailPage packetId={packetId} />;
}
