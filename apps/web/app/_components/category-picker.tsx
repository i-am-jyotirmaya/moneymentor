"use client";

import type { CategoryItem, TransactionType } from "@/lib/api";
import { useId, useState } from "react";

export function CategoryPicker({ categories, categoryId, categoryName, type, disabled, onChange }: {
  categories: CategoryItem[];
  categoryId: string | null;
  categoryName: string;
  type: TransactionType;
  disabled: boolean;
  onChange: (category: CategoryItem) => void;
}) {
  const [search, setSearch] = useState("");
  const id = useId();
  const byId = new Map(categories.map((category) => [category.id, category]));
  const available = categories.filter((category) =>
    category.type === (type === "Income" ? "Income" : "Expense") && !category.isHidden &&
    (!category.parentCategoryId || !byId.get(category.parentCategoryId)?.isHidden),
  ).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const label = (category: CategoryItem) => {
    const parent = category.parentCategoryId ? byId.get(category.parentCategoryId) : null;
    return parent ? `${parent.name} › ${category.name}` : category.name;
  };
  const selected = available.find((category) => category.id === categoryId);
  const matches = available.filter((category) => label(category).toLowerCase().includes(search.trim().toLowerCase()));
  // Keep the saved selection visible while searching without changing the form.
  const options = selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  const groups = new Map<string, CategoryItem[]>();
  for (const category of options) {
    const parent = category.parentCategoryId ? byId.get(category.parentCategoryId) : null;
    const group = parent?.name ?? (available.some((child) => child.parentCategoryId === category.id) ? category.name : "Other categories");
    groups.set(group, [...(groups.get(group) ?? []), category]);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor={`${id}-category`}>Category</label>
      <input
        aria-label="Search categories"
        aria-describedby={`${id}-help`}
        className="form-control"
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search a category or group"
        type="search"
        value={search}
      />
      <select
        className="form-control"
        disabled={disabled}
        id={`${id}-category`}
        onChange={(event) => {
          const category = byId.get(event.target.value);
          if (category) {
            onChange(category);
            setSearch("");
          }
        }}
        value={selected?.id ?? ""}
      >
        {!selected ? <option value="" disabled>{categoryName ? `${categoryName} (current category)` : "Choose a category"}</option> : null}
        {Array.from(groups, ([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((category) => <option key={category.id} value={category.id}>{label(category)}</option>)}
          </optgroup>
        ))}
      </select>
      <p className="text-xs text-[var(--muted)]" id={`${id}-help`} aria-live="polite">
        {available.length === 0 ? "No categories available. Your current category will be kept." :
          search.trim() && matches.length === 0 ? "No matching categories. Try another search." : "Choose a category from its group."}
      </p>
    </div>
  );
}
