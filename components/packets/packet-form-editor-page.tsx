"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useId } from "react";

const PacketFormEditor = dynamic(
  () =>
    import("@/components/packets/packet-form-editor").then(
      (module) => module.PacketFormEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">
        Loading packet form editor...
      </p>
    ),
  },
);

type PacketFormEditorPageProps = {
  packetId: number;
  packetFormId: number;
};

export function PacketFormEditorPage({
  packetId,
  packetFormId,
}: PacketFormEditorPageProps) {
  const editorInstanceId = useId();

  if (!Number.isFinite(packetId) || !Number.isFinite(packetFormId)) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">Invalid packet or form ID.</p>
        <Button variant="outline" asChild>
          <Link href="/">Back to packets</Link>
        </Button>
      </div>
    );
  }

  return (
    <PacketFormEditor
      key={editorInstanceId}
      packetId={packetId}
      packetFormId={packetFormId}
    />
  );
}
