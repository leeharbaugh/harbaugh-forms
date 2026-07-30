/** Events that must always be recorded even when ordinary logging is off. */
export const MANDATORY_AUDIT_ACTIONS = new Set([
  "audit_logging_enabled",
  "audit_logging_disabled",
  "audit_setting_change_unauthorized",
  "global_admin_access_granted",
  "global_admin_access_removed",
  "impersonation_started",
  "impersonation_ended",
  "test_user_permanently_deleted",
  "test_user_deletion_failed",
]);
