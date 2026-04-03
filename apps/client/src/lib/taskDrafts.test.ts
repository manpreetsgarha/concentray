import { describe, expect, it } from "vitest";

import { parseTaskUrgency, taskUrgencyError } from "./taskDrafts";

describe("task urgency helpers", () => {
  it("accept trimmed whole numbers from 1 to 5", () => {
    expect(parseTaskUrgency(" 4 ")).toBe(4);
    expect(parseTaskUrgency("1")).toBe(1);
    expect(parseTaskUrgency("5")).toBe(5);
    expect(taskUrgencyError(" 3 ")).toBeNull();
  });

  it("reject blank, fractional, and out-of-range values", () => {
    const message = "Urgency must be a whole number from 1 to 5.";

    expect(parseTaskUrgency("")).toBeNull();
    expect(parseTaskUrgency("0")).toBeNull();
    expect(parseTaskUrgency("6")).toBeNull();
    expect(parseTaskUrgency("2.5")).toBeNull();
    expect(parseTaskUrgency("abc")).toBeNull();

    expect(taskUrgencyError("")).toBe(message);
    expect(taskUrgencyError("0")).toBe(message);
    expect(taskUrgencyError("6")).toBe(message);
    expect(taskUrgencyError("2.5")).toBe(message);
    expect(taskUrgencyError("abc")).toBe(message);
  });
});
