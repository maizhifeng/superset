import axios from "axios";
import { getStoredToken } from "@/api/tokenStorage";

/**
 * CSRF token management.  The token is minted once per session and attached
 * to non-idempotent requests by the client request interceptor.
 */

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

export function unsetCsrfToken(): void {
  csrfToken = null;
}

export async function fetchCsrfToken(): Promise<string | null> {
  const token = getStoredToken();
  try {
    const res = await axios.get("/api/v1/security/csrf_token/", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      withCredentials: true,
    });
    const result = res.data?.result ?? null;
    if (result) {
      csrfToken = result;
    }
    return result;
  } catch (err) {
    console.error("CSRF token fetch failed:", err);
    return null;
  }
}

export async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;
  csrfPromise = fetchCsrfToken().finally(() => {
    csrfPromise = null;
  });
  return csrfPromise;
}
