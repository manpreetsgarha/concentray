import { useCallback } from "react";

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

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.ok === false) {
        throw new Error(String(payload.error ?? `Request failed (${response.status})`));
      }
      return payload;
    },
    [baseUrl]
  );
}
