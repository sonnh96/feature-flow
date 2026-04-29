const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("access_token");
  const headers = new Headers(opts.headers || {});

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem("access_token");
      headers.set("Authorization", `Bearer ${newToken}`);
      const retry = await fetch(`${API_BASE}${path}`, { ...opts, headers });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(`API error ${retry.status}: ${text}`);
      }
      return retry.json();
    }
    // Refresh failed — clear auth and redirect
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/auth";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export { API_BASE, apiFetch };