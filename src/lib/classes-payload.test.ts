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

import { isValidRoster } from "./classes-payload";
const strictNorm = (c: unknown) => {
  const x = c as { id?: unknown; name?: unknown; students?: unknown };
  return typeof x?.id === "string" && typeof x.name === "string" && isValidRoster(x.students) ? x : null;
};
describe("stored roster validation", () => {
  it("valid id/name with malformed students rejects the whole payload", () => {
    const raw = JSON.stringify({ lastId: "audit", classes: [{ id: "audit", name: "Fairness edge", students: "not-an-array" }] });
    expect(parseClassesPayload(raw, strictNorm).kind).toBe("invalid");
  });
  it("an array containing one invalid student is rejected, not dropped", () => {
    const raw = JSON.stringify({ classes: [{ id: "a", name: "A", students: [{ id: "s1", name: "Ana", total: 1 }, { id: 5 }] }] });
    expect(parseClassesPayload(raw, strictNorm).kind).toBe("invalid");
    expect(isValidRoster([{ id: "s", name: "S", total: "abc" }])).toBe(false);
  });
  it("empty roster and legacy students without optional fields are accepted", () => {
    expect(isValidRoster([])).toBe(true);
    expect(isValidRoster([{ id: "s1", name: "Ana" }])).toBe(true);
    const raw = JSON.stringify({ classes: [{ id: "a", name: "A", students: [{ id: "s1", name: "Ana" }] }] });
    expect(parseClassesPayload(raw, strictNorm).kind).toBe("ok");
  });
});
