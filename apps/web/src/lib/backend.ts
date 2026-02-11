import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_SEC,
  REFRESH_COOKIE,
  REFRESH_DEFAULT_MAX_AGE_SEC,
} from "@/lib/session";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
};

export function apiBaseURL() {
  return (process.env.PREPTRACKER_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
}

export async function readTokensFromCookies() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value || "",
    refreshToken: jar.get(REFRESH_COOKIE)?.value || "",
  };
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function setAuthCookies(res: NextResponse, tokens: TokenPair) {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_SEC,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_DEFAULT_MAX_AGE_SEC,
  });
}

export async function tryRefresh(refreshToken: string): Promise<TokenPair | null> {
  if (!refreshToken) return null;
  try {
    const resp = await fetch(apiBaseURL() + "/api/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    return (await resp.json()) as TokenPair;
  } catch {
    return null;
  }
}

type ProxyJSONOpts = {
  method: string;
  path: string;
  body?: unknown;
  auth?: boolean;
};

export async function proxyJSON(opts: ProxyJSONOpts): Promise<NextResponse> {
  const { method, path, body, auth = true } = opts;

  const { accessToken, refreshToken } = await readTokensFromCookies();
  let at = accessToken;
  let rt = refreshToken;
  let refreshed: TokenPair | null = null;

  const doFetch = async (token: string) => {
    try {
      return await fetch(apiBaseURL() + path, {
        method,
        headers: {
          ...(auth ? { authorization: token ? `Bearer ${token}` : "" } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (e) {
      const msg =
        process.env.NODE_ENV === "production"
          ? "backend unavailable (is the Go API running?)"
          : `backend unavailable (is the Go API running?): ${String(e)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: {
          "content-type": "application/json",
          "x-preptracker-proxy-error": "backend-unreachable",
        },
      });
    }
  };

  let resp = await doFetch(at);
  if (auth && resp.status === 401 && rt) {
    refreshed = await tryRefresh(rt);
    if (refreshed) {
      at = refreshed.access_token;
      rt = refreshed.refresh_token;
      resp = await doFetch(at);
    }
  }

  // For statuses that must not include a body, return a body-less response.
  // Otherwise Next/undici can throw "Invalid response status code 204".
  if (resp.status === 204 || resp.status === 205 || resp.status === 304) {
    const out = new NextResponse(null, { status: resp.status });
    if (refreshed) setAuthCookies(out, refreshed);
    return out;
  }

  const contentType = resp.headers.get("content-type") || "";
  const isJSON = contentType.includes("application/json");
  const payloadText = await resp.text();
  const payload = isJSON && payloadText ? JSON.parse(payloadText) : payloadText || null;

  const out = isJSON
    ? NextResponse.json(payload, { status: resp.status })
    : new NextResponse(payloadText, {
        status: resp.status,
        headers: { "content-type": contentType || "text/plain; charset=utf-8" },
      });

  if (refreshed) setAuthCookies(out, refreshed);
  return out;
}
