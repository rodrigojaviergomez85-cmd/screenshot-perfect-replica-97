import { describe, expect, it } from "vitest";
import { parseClassesPayload } from "./classes-payload";

const norm = (c: unknown) => (c && typeof c === "object" && "id" in c ? (c as { id: string }) : null);

describe("saved classes read", () => {
  it("absent data is distinct from malformed data", () => {
    expect(parseClassesPayload(null, norm).kind).toBe("absent");
    for (const bad of ["{", "[]", "null", "42", '{"classes":{}}', '{"lastId":"a"}', '{"classes":[{"x":1}]}'])
      expect(parseClassesPayload(bad, norm).kind).toBe("invalid");
  });
  it("valid payload keeps every class and lastId", () => {
    const r = parseClassesPayload('{"lastId":"a","classes":[{"id":"a"},{"id":"b"}]}', norm);
    expect(r).toEqual({ kind: "ok", lastId: "a", classes: [{ id: "a" }, { id: "b" }] });
  });
});
