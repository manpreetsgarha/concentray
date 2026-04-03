import { describe, expect, it } from "vitest";

import { readApiPayload } from "./useLocalApi";

describe("readApiPayload", () => {
  it("returns an empty object for 204 responses", async () => {
    const response = new Response(null, { status: 204 });

    await expect(readApiPayload(response)).resolves.toEqual({});
  });

  it("rejects invalid JSON payloads", async () => {
    const response = new Response("{bad", { status: 200 });

    await expect(readApiPayload(response)).rejects.toThrow("API returned invalid JSON");
  });
});
