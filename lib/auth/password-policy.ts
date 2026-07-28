export const MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side password policy for invite and recovery password creation.
 * Keep messages user-facing and free of echoed password values.
 */
export function validateNewPassword(options: {
  password: string;
  confirmPassword: string;
}): PasswordValidationResult {
  const { password, confirmPassword } = options;

  if (!password || !confirmPassword) {
    return { ok: false, error: "Password and confirmation are required." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  // Basic complexity: at least one letter and one number.
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      error: "Password must include at least one letter and one number.",
    };
  }

  return { ok: true };
}
