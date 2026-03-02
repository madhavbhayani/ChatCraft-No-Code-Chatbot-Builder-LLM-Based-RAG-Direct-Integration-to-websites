/**
 * Cookie-based auth session utilities.
 * Session data is stored in a cookie that expires after 24 hours.
 */

const COOKIE_NAME = "chatcraft_session";
const EXPIRY_HOURS = 24;

/**
 * Save session data (token + user) as a cookie with 24h expiry.
 */
export function saveSession(token, user) {
  const session = JSON.stringify({ token, user });
  const expires = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(session)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Read and parse the session cookie.
 * Returns { token, user } or null if expired / missing.
 */
export function getSession() {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

/**
 * Check whether a valid session exists.
 */
export function isLoggedIn() {
  return getSession() !== null;
}

/**
 * Clear the session cookie (logout).
 */
export function clearSession() {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}
