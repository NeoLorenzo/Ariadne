export const AUTHORIZED_APP_EMAIL = "theneolorenzo@gmail.com";

export function normalizeAuthEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAuthorizedAppUser(user) {
  return normalizeAuthEmail(user?.email) === AUTHORIZED_APP_EMAIL;
}
