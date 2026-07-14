/**
 * Public signup is disabled for beta. Kept as a thin re-export so stale imports
 * fail closed to the invitation-only notice rather than calling browser signup.
 */
export { InvitationOnlyNotice as SignUpForm } from "@/components/invitation-only-notice";
