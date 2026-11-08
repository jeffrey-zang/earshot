// Spotify login with Authorization Code + PKCE. Runs entirely in the browser: no client secret,
// no backend. Tokens live in localStorage.

const TOKEN_KEY = "earshot.spotify.token.v1";
const VERIFIER_KEY = "earshot.spotify.verifier";
const CLIENT_KEY = "earshot.spotify.clientId";

export const LIBRARY_SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-follow-read",
  "user-top-read",
  "user-read-recently-played",
];

export const PLAYBACK_SCOPES = ["streaming", "user-read-email", "user-read-private", "user-modify-playback-state", "user-read-playback-state"];

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
  client_id: string;
}

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getClientId(): string {
  return ls()?.getItem(CLIENT_KEY) || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
}

export function getCustomClientId(): string {
  return ls()?.getItem(CLIENT_KEY) || "";
}

export function setCustomClientId(id: string) {
  const store = ls();
  if (!store) return;
  if (id.trim()) store.setItem(CLIENT_KEY, id.trim());
  else store.removeItem(CLIENT_KEY);
}

export function redirectUri(): string {
  return `${window.location.origin}/callback`;
}

function readToken(): StoredToken | null {
  try {
    const raw = ls()?.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function writeToken(t: StoredToken | null) {
  const store = ls();
  if (!store) return;
  if (t) store.setItem(TOKEN_KEY, JSON.stringify(t));
  else store.removeItem(TOKEN_KEY);
}

export function isConnected(): boolean {
  return !!readToken();
}

export function hasScopes(scopes: string[]): boolean {
  const t = readToken();
  if (!t) return false;
  const granted = new Set(t.scope.split(" "));
  return scopes.every((s) => granted.has(s));
}

export function logout() {
  writeToken(null);
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginLogin(opts: { playback?: boolean; returnTo?: string } = {}) {
  const clientId = getClientId();
  if (!clientId) throw new Error("No Spotify client ID configured");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, state, returnTo: opts.returnTo ?? "/" }));
  const scopes = [...LIBRARY_SCOPES, ...(opts.playback ? PLAYBACK_SCOPES : [])];
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: scopes.join(" "),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Spotify token error (${res.status})`);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? body.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    scope: data.scope ?? "",
    client_id: body.client_id,
  };
}

/** Finish the login on /callback. Returns the path to go back to. */
export async function completeLogin(code: string, state: string): Promise<string> {
  const saved = JSON.parse(sessionStorage.getItem(VERIFIER_KEY) || "null") as { verifier: string; state: string; returnTo: string } | null;
  if (!saved || saved.state !== state) throw new Error("Login session expired, please try again");
  sessionStorage.removeItem(VERIFIER_KEY);
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: getClientId(),
    code_verifier: saved.verifier,
  });
  writeToken(token);
  return saved.returnTo;
}

let refreshing: Promise<string | null> | null = null;

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const t = readToken();
  if (!t) return null;
  if (!forceRefresh && Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) {
    writeToken(null);
    return null;
  }
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.client_id })
      .then((nt) => {
        writeToken(nt);
        return nt.access_token;
      })
      .catch(() => {
        writeToken(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
