import { useCallback } from "react";

interface BrowserLocationLike {
  hostname: string;
  protocol?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "0.0.0.0", "localhost", "::1"]);

function normalizeBaseUrl(url: URL): string {
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.protocol}//${url.host}${pathname}${url.search}`;
}

function normalizePort(port: string): string | null {
  const trimmed = port.trim();
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function normalizeProtocol(protocol?: string): string {
  if (protocol?.endsWith(":")) {
    return protocol;
  }
  return "http:";
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.trim().toLowerCase());
}

export function resolveLocalApiBaseUrl(
  configuredUrl: string,
  configuredPort?: string,
  browserLocation?: BrowserLocationLike | null
): string {
  const trimmed = configuredUrl.trim();
  const location = browserLocation ?? (globalThis as { location?: BrowserLocationLike }).location;
  const resolvedPort = normalizePort(configuredPort ?? "");

  if (resolvedPort && location?.hostname) {
    return `${normalizeProtocol(location.protocol)}//${location.hostname}:${resolvedPort}`;
  }
  if (!trimmed) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!location || !location.hostname) {
    return normalizeBaseUrl(parsed);
  }
  if (!isLoopbackHost(parsed.hostname) || isLoopbackHost(location.hostname)) {
    return normalizeBaseUrl(parsed);
  }

  parsed.hostname = location.hostname;
  return normalizeBaseUrl(parsed);
}

export async function readApiPayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) {
    return {};
  }

  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      error instanceof Error ? `API returned invalid JSON: ${error.message}` : "API returned invalid JSON."
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("API returned an unexpected payload.");
  }

  return payload as Record<string, unknown>;
}

export function useLocalApi(baseUrl: string) {
  return useCallback(
    async (path: string, init?: RequestInit) => {
      const resolvedBaseUrl = resolveLocalApiBaseUrl(baseUrl);
      if (!resolvedBaseUrl) {
        throw new Error("Set EXPO_PUBLIC_LOCAL_API_URL or EXPO_PUBLIC_LOCAL_API_PORT before running the client.");
      }

      const response = await fetch(`${resolvedBaseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      const payload = await readApiPayload(response);
      if (!response.ok || payload.ok === false) {
        throw new Error(String(payload.error ?? `Request failed (${response.status})`));
      }
      return payload;
    },
    [baseUrl]
  );
}
