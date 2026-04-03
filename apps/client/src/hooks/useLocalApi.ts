import { useCallback } from "react";

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
      if (!baseUrl) {
        throw new Error("Set EXPO_PUBLIC_LOCAL_API_URL before running the client.");
      }

      const response = await fetch(`${baseUrl}${path}`, {
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
