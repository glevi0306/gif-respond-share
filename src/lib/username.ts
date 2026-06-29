export function validateUsername(value: string): string | null {
  if (value.length < 3) return "At least 3 characters required.";
  if (value.length > 20) return "Maximum 20 characters.";
  if (!/^[a-z0-9_]+$/.test(value)) return "Only lowercase letters, numbers, and _.";
  return null;
}

export function friendlyAuthError(raw: string): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "No internet connection. Please check your network and try again.";
  }
  const msg = raw.toLowerCase();
  if (msg.includes("already registered") || msg.includes("user already exists")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (msg.includes("invalid login credentials") || msg.includes("invalid email or password")) {
    return "Wrong email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email before logging in. Check your inbox.";
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (/password.*at least 6/.test(msg)) {
    return "Password must be at least 6 characters.";
  }
  if (
    (msg.includes("username") && msg.includes("duplicate")) ||
    msg.includes("profiles_username_key")
  ) {
    return "That username is already taken. Please choose another.";
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror")
  ) {
    return "Connection error. Please check your internet and try again.";
  }
  return raw;
}
