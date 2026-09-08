import { describe, expect, it } from "vitest";
import path from "node:path";
import { isValidWindowsName, resolveInside } from "./safety";

describe("vault file safety", () => {
  const root = path.resolve("C:/vault");
  it("accepts nested vault files", () =>
    expect(resolveInside(root, "Notes/a.md")).toBe(
      path.join(root, "Notes/a.md"),
    ));
  it("rejects traversal above a vault", () =>
    expect(() => resolveInside(root, "../secret.txt")).toThrow(/boundary/));
  it("rejects Windows reserved punctuation", () =>
    expect(isValidWindowsName("bad:name.md")).toBe(false));
});
