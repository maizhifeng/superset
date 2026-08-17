import { test, expect } from "vitest";
import { buildTree, mergeConsecutive } from "@/utils/pivot/tree";

test("mergeConsecutive collapses adjacent equal labels", () => {
  expect(mergeConsecutive(["a", "a", "b", "b", "b", "c"])).toEqual([
    { label: "a", span: 2 },
    { label: "b", span: 3 },
    { label: "c", span: 1 },
  ]);
  expect(mergeConsecutive([])).toEqual([]);
  expect(mergeConsecutive(["a", "b", "c"])).toEqual([
    { label: "a", span: 1 },
    { label: "b", span: 1 },
    { label: "c", span: 1 },
  ]);
});

test("buildTree groups single-level row headers", () => {
  const rowHeaders = [["x", "x", "y"]];
  const tree = buildTree(0, [0, 1, 2], [], rowHeaders);
  expect(tree).toHaveLength(2);
  expect(tree[0].keyTuple).toEqual(["x"]);
  expect(tree[0].rows).toEqual([0, 1]);
  expect(tree[1].keyTuple).toEqual(["y"]);
  expect(tree[1].rows).toEqual([2]);
});

test("buildTree groups non-adjacent keys with a single group (95% mode)", () => {
  // Same first-level key but interleaved by the second level — must still
  // collapse into one group at this level.
  const rowHeaders = [
    ["a", "b", "a"],
    ["1", "1", "2"],
  ];
  const tree = buildTree(0, [0, 1, 2], [], rowHeaders);
  expect(tree).toHaveLength(2);
  const a = tree.find((g) => g.keyTuple[0] === "a");
  expect(a?.rows).toEqual([0, 2]);
});

test("buildTree produces nested children for multi-level headers", () => {
  const rowHeaders = [
    ["a", "a", "b"],
    ["1", "2", "3"],
  ];
  const tree = buildTree(0, [0, 1, 2], [], rowHeaders);
  const a = tree.find((g) => g.keyTuple[0] === "a");
  expect(a?.children).toHaveLength(2);
  expect(a?.children[0].keyTuple).toEqual(["a", "1"]);
  expect(a?.children[1].keyTuple).toEqual(["a", "2"]);
  const b = tree.find((g) => g.keyTuple[0] === "b");
  expect(b?.children[0].keyTuple).toEqual(["b", "3"]);
});
