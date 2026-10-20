/** Dashboard staff: absolute session lifetime from login (client + jwt for non-POS roles). */
export const DASHBOARD_SESSION_MS = 12 * 60 * 60 * 1000;
/** Cashier / POS: long-lived cookie so the register stays signed in. */
export const CASHIER_SESSION_MAX_AGE_SEC = 365 * 24 * 60 * 60;
/** How often Auth.js may refresh the session cookie while it is in use. */
export const SESSION_UPDATE_AGE_SEC = 60 * 60;

export function isCashierRole(role: unknown): boolean {
  return role === "CASHIER";
}

/** Roles that may run `/pos` — never killed by the 12h jwt rule (POS is 24/7). */
export function isPosSessionRole(role: unknown): boolean {
  return role === "CASHIER" || role === "MANAGER" || role === "ADMIN";
}
