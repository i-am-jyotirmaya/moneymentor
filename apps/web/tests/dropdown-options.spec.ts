import { expect, test } from "@playwright/test";
import { filterDropdownRows, flattenDropdownOptions, type DropdownOption } from "../app/_components/dropdown-options";

const tree: DropdownOption[] = [
  { value: "food", label: "Food", children: [
    { value: "dining", label: "Dining", children: [
      { value: "restaurants", label: "Restaurants", description: "Meals out" },
      { value: "coffee", label: "Coffee" },
    ] },
    { value: "groceries", label: "Groceries" },
  ] },
  { value: "travel", label: "Travel", selectable: true, children: [
    { value: "travel-coffee", label: "Coffee" },
  ] },
  { value: "archived", label: "Archived", disabled: true, children: [
    { value: "disabled-child", label: "Old category" },
  ] },
];

test("flat options are selectable and preserve caller order", () => {
  const rows = flattenDropdownOptions([{ value: "private", label: "Private" }, { value: "shared", label: "Household" }]);
  expect(rows.map((row) => [row.path, row.depth, row.selectable])).toEqual([["Private", 0, true], ["Household", 0, true]]);
});

test("nested options retain full paths and branch selection is explicit", () => {
  const rows = flattenDropdownOptions(tree);
  expect(rows.find((row) => row.option.value === "restaurants")).toMatchObject({ path: "Food › Dining › Restaurants", depth: 2, ancestors: ["food", "dining"], selectable: true });
  expect(rows.find((row) => row.option.value === "food")?.selectable).toBe(false);
  expect(rows.find((row) => row.option.value === "travel")?.selectable).toBe(true);
  expect(rows.find((row) => row.option.value === "disabled-child")?.disabled).toBe(true);
});

test("search retains matching ancestors and never adds unrelated supplied options", () => {
  const rows = flattenDropdownOptions(tree);
  expect(filterDropdownRows(rows, "  RESTAURANTS  ").map((row) => row.option.value)).toEqual(["food", "dining", "restaurants"]);
  expect(filterDropdownRows(rows, "meals out").map((row) => row.option.value)).toEqual(["food", "dining", "restaurants"]);
  expect(filterDropdownRows(rows, "Dining").map((row) => row.option.value)).toEqual(["food", "dining", "restaurants", "coffee"]);
  expect(filterDropdownRows(rows, "not supplied")).toEqual([]);
});

test("duplicate labels in different branches keep distinct values and paths", () => {
  const rows = filterDropdownRows(flattenDropdownOptions(tree), "Coffee");
  expect(rows.filter((row) => row.selectable).map((row) => [row.option.value, row.path])).toEqual([
    ["coffee", "Food › Dining › Coffee"], ["travel-coffee", "Travel › Coffee"],
  ]);
});

test("clearing search restores all options without mutating the supplied tree", () => {
  const original = JSON.stringify(tree);
  const rows = flattenDropdownOptions(tree);
  filterDropdownRows(rows, "Coffee");
  expect(filterDropdownRows(rows, "")).toEqual(rows);
  expect(JSON.stringify(tree)).toBe(original);
  expect(flattenDropdownOptions([])).toEqual([]);
});
