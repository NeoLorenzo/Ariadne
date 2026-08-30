import { describe, expect, it } from "vitest";
import { projectCollectionsEqual, reconcileProjectCollections } from "./reconcile";

const p = (id, name) => ({ id, name });

describe("reconcileProjectCollections", () => {
  it("preserves a local edit", () => expect(reconcileProjectCollections([p("a", "A")], [p("a", "local")], [p("a", "A")])).toEqual([p("a", "local")]));
  it("accepts a remote edit when local is unchanged", () => expect(reconcileProjectCollections([p("a", "A")], [p("a", "A")], [p("a", "remote")])).toEqual([p("a", "remote")]));
  it("prefers local when both changed", () => expect(reconcileProjectCollections([p("a", "A")], [p("a", "local")], [p("a", "remote")])).toEqual([p("a", "local")]));
  it("keeps independent additions", () => expect(reconcileProjectCollections([], [p("b", "B")], [p("c", "C")])).toEqual([p("c", "C"), p("b", "B")]));
  it("preserves local deletion", () => expect(reconcileProjectCollections([p("a", "A")], [], [p("a", "A")])).toEqual([]));
  it("preserves remote deletion when local is unchanged", () => expect(reconcileProjectCollections([p("a", "A")], [p("a", "A")], [])).toEqual([]));
  it("merges changes on different IDs", () => expect(reconcileProjectCollections([p("a", "A"), p("b", "B")], [p("a", "local"), p("b", "B")], [p("a", "A"), p("b", "remote")])).toEqual([p("a", "local"), p("b", "remote")]));
  it("compares collections by value", () => expect(projectCollectionsEqual([p("a", "A")], [p("a", "A")])).toBe(true));
});
