import { describe, expect, it } from "vitest";

import { readApiPayload, resolveLocalApiBaseUrl } from "./useLocalApi";

describe("useLocalApi helpers", () => {
  it("builds a same-host API URL from the configured API port", () => {
    expect(
      resolveLocalApiBaseUrl("", "8788", {
        hostname: "192.168.1.24",
        protocol: "http:",
      })
    ).toBe("http://192.168.1.24:8788");
  });

  it("rewrites loopback API URLs to the current browser host", () => {
    expect(
      resolveLocalApiBaseUrl("http://127.0.0.1:8788", undefined, {
        hostname: "192.168.1.24",
      })
    ).toBe("http://192.168.1.24:8788");
  });

  it("keeps non-loopback API URLs unchanged", () => {
    expect(
      resolveLocalApiBaseUrl("http://10.0.0.5:8787/api", undefined, {
        hostname: "192.168.1.24",
      })
    ).toBe("http://10.0.0.5:8787/api");
  });

  it("keeps loopback URLs unchanged on the same machine", () => {
    expect(
      resolveLocalApiBaseUrl("http://localhost:8787", undefined, {
        hostname: "localhost",
      })
    ).toBe("http://localhost:8787");
  });

  it("returns an empty object for 204 responses", async () => {
    const response = new Response(null, { status: 204 });

    await expect(readApiPayload(response)).resolves.toEqual({});
  });

  it("rejects invalid JSON payloads", async () => {
    const response = new Response("{bad", { status: 200 });

    await expect(readApiPayload(response)).rejects.toThrow("API returned invalid JSON");
  });
});
