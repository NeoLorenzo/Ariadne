const GITHUB_PROVIDER_TOKEN_STORAGE_KEY = "fabbro_github_provider_token_v1";
const GITHUB_OAUTH_PENDING_STORAGE_KEY = "fabbro_github_oauth_pending_v1";

function getCurrentOAuthProvider(session) {
  const identities = Array.isArray(session?.user?.identities)
    ? session.user.identities
    : [];
  const mostRecentIdentity = identities.reduce((latest, identity) => {
    const timestamp = Date.parse(String(identity?.last_sign_in_at || ""));
    if (!Number.isFinite(timestamp)) {
      return latest;
    }

    if (!latest || timestamp > latest.timestamp) {
      return {
        provider: String(identity?.provider || "").trim().toLowerCase(),
        timestamp
      };
    }

    return latest;
  }, null);

  if (mostRecentIdentity?.provider) {
    return mostRecentIdentity.provider;
  }

  return String(session?.user?.app_metadata?.provider || "").trim().toLowerCase();
}

export function captureGitHubProviderToken(session) {
  if (typeof window === "undefined") {
    return "";
  }

  const userId = String(session?.user?.id || "").trim();
  const providerToken = String(session?.provider_token || "").trim();
  if (!userId || !providerToken) {
    return "";
  }

  try {
    const pendingOAuth = JSON.parse(
      window.sessionStorage.getItem(GITHUB_OAUTH_PENDING_STORAGE_KEY) || "null"
    );
    const tokenChangedDuringGitHubOAuth =
      pendingOAuth?.provider === "github" &&
      providerToken !== String(pendingOAuth?.previousProviderToken || "").trim();
    if (
      getCurrentOAuthProvider(session) !== "github" &&
      !tokenChangedDuringGitHubOAuth
    ) {
      return "";
    }

    window.sessionStorage.setItem(
      GITHUB_PROVIDER_TOKEN_STORAGE_KEY,
      JSON.stringify({ userId, providerToken })
    );
    window.sessionStorage.removeItem(GITHUB_OAUTH_PENDING_STORAGE_KEY);
  } catch {
    // The caller can still use the token from the current OAuth session.
    if (getCurrentOAuthProvider(session) !== "github") {
      return "";
    }
  }

  return providerToken;
}

export function prepareGitHubOAuth(session) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      GITHUB_OAUTH_PENDING_STORAGE_KEY,
      JSON.stringify({
        provider: "github",
        previousProviderToken: String(session?.provider_token || "").trim()
      })
    );
  } catch {
    // Provider identity metadata is still used when session storage is unavailable.
  }
}

export function readGitHubProviderToken(session) {
  const capturedToken = captureGitHubProviderToken(session);
  if (capturedToken) {
    return capturedToken;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const userId = String(session?.user?.id || "").trim();
  if (!userId) {
    return "";
  }

  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(GITHUB_PROVIDER_TOKEN_STORAGE_KEY) || "null"
    );
    if (String(stored?.userId || "").trim() !== userId) {
      return "";
    }
    return String(stored?.providerToken || "").trim();
  } catch {
    return "";
  }
}

export function clearGitHubProviderToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(GITHUB_PROVIDER_TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(GITHUB_OAUTH_PENDING_STORAGE_KEY);
  } catch {
    // Storage cleanup should not prevent sign-out or reauthorization.
  }
}
