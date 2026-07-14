import "server-only";

import {
  AdminAuthorizationError,
  requireAppAdmin,
} from "@/lib/admin/require-app-admin";
import { redirect } from "next/navigation";

export async function requireAppAdminPage() {
  try {
    return await requireAppAdmin();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      if (error.code === "UNAUTHENTICATED") {
        redirect("/auth/login");
      }
      redirect("/?error=admin_forbidden");
    }
    throw error;
  }
}
