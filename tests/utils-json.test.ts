import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/utils/json";

describe("extractJsonObject", () => {
  it("parses clean JSON", () => {
    const result = extractJsonObject('{"summary":"test","energyScore":70}');
    expect(result).toEqual({ summary: "test", energyScore: 70 });
  });

  it("extracts JSON embedded in text", () => {
    const raw = 'Here is the result:\n```json\n{"summary":"test"}\n```\nDone.';
    const result = extractJsonObject(raw);
    expect(result?.summary).toBe("test");
  });

  it("returns null for invalid JSON", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractJsonObject("")).toBeNull();
  });

  it("handles nested objects", () => {
    const raw = '{"a":{"b":1},"c":[1,2,3]}';
    const result = extractJsonObject(raw);
    expect(result?.a).toEqual({ b: 1 });
    expect(result?.c).toEqual([1, 2, 3]);
  });
});
