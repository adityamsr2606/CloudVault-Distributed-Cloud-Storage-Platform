export const PASSWORD_MIN_LENGTH = 12;

export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Add at least one symbol.";
  return null;
}
