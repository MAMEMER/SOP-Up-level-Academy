// Shared session-cookie name for the SOP Firebase auth (kept in lib so both the
// server auth guard and the /api/auth/session route can import it without a route↔lib
// dependency cycle).
export const SOP_SESSION_COOKIE = "sop_session";
export const SOP_SESSION_EXPIRES_IN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
