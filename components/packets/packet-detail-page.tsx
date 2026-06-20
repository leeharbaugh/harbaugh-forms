"use client";

import { PacketDetail } from "@/components/packets/packet-detail";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type PacketDetailPageProps = {
  packetId: number;
};

export function PacketDetailPage({ packetId }: PacketDetailPageProps) {
  if (!Number.isFinite(packetId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid packet ID.</p>
        <Button variant="outline" asChild>
          <Link href="/">Back to packets</Link>
        </Button>
      </div>
    );
  }

  return <PacketDetail packetId={packetId} />;
}
