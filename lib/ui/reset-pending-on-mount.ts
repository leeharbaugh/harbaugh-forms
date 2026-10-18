"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * Clears a client mutation-pending flag when the component mounts.
 *
 * Soft navigation / route cache can restore a client component that left
 * `isLoading` / `isSaving` true after a successful submit that navigated away
 * without resetting that flag. Resetting on mount makes Logout → Login and
 * Signing → Packet Edit usable without an F5.
 */
export function useResetPendingOnMount(
  setPending: Dispatch<SetStateAction<boolean>>,
): void {
  useEffect(() => {
    setPending(false);
  }, [setPending]);
}
