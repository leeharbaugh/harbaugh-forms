import { AuthShell } from "@/components/auth-shell";
import { InvitationOnlyNotice } from "@/components/invitation-only-notice";

export default function Page() {
  return (
    <AuthShell>
      <InvitationOnlyNotice />
    </AuthShell>
  );
}
