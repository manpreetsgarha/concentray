import type { ReactNode } from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await import("react-native-web");
  return {
    ...actual,
    Modal: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders the confirmation copy", () => {
    const tree = create(
      <ConfirmDialog
        visible
        busy
        title="Delete task?"
        body="This cannot be undone."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain("Delete task?");
    expect(rendered).toContain("This cannot be undone.");
    expect(rendered).toContain("Confirm");
  });
});
