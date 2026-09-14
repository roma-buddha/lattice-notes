import { describe, expect, it } from "vitest";
import { browserAddress } from "../browserSession";

describe("browser address bar", () => {
  it("keeps a blank new tab blank", () => {
    expect(browserAddress("")).toBe("");
  });

  it("opens domains directly and searches only after submitted plain text", () => {
    expect(browserAddress("example.com/docs")).toBe("https://example.com/docs");
    expect(browserAddress("hello lotus")).toBe(
      "https://duckduckgo.com/?q=hello%20lotus",
    );
  });
});
