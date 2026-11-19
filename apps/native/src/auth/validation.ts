type AuthFormValues = {
  mode: "login" | "signup" | "request";
  displayName: string;
  email: string;
  password: string;
  accepted: boolean;
};

// WHATWG HTML input type=email constraint (single address).
const validEmail = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function validateAuthForm({ mode, displayName, email, password, accepted }: AuthFormValues): string {
  if ((mode !== "login" && !displayName.trim()) || !email.trim() || (mode !== "request" && !password)) {
    return "Please fill out all required fields.";
  }
  if (!validEmail.test(email.trim())) return "Please enter a valid email address.";
  if (mode === "signup" && !accepted) return "Please accept the beta privacy policy.";
  return "";
}

export function authFieldLocks(invitation?: unknown): { displayName: false; email: boolean } {
  return { displayName: false, email: !!invitation };
}
