"use client";

import type { CategoryItem, TransactionType } from "@/lib/api";
import { Dropdown, type DropdownOption } from "./dropdown";

export function CategoryPicker({ categories, categoryId, categoryName, type, disabled, onChange }: {
  categories: CategoryItem[];
  categoryId: string | null;
  categoryName: string;
  type: TransactionType;
  disabled: boolean;
  onChange: (category: CategoryItem) => void;
}) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const available = categories.filter((category) =>
    category.type === (type === "Income" ? "Income" : "Expense") && !category.isHidden &&
    (!category.parentCategoryId || !byId.get(category.parentCategoryId)?.isHidden),
  ).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const availableIds = new Set(available.map((category) => category.id));
  function toOption(category: CategoryItem): DropdownOption {
    const children = available.filter((child) => child.parentCategoryId === category.id);
    return {
      value: category.id,
      label: category.name,
      selectable: true,
      children: children.length ? children.map(toOption) : undefined,
    };
  }
  const options = available.filter((category) => !category.parentCategoryId || !availableIds.has(category.parentCategoryId)).map(toOption);

  return (
    <div className="space-y-2">
      <Dropdown
        disabled={disabled}
        emptyMessage="No categories available. Your current category will be kept."
        label="Category"
        noResultsMessage="No matching categories. Try another search."
        onChange={(id) => {
          const category = byId.get(id);
          if (category) onChange(category);
        }}
        options={options}
        placeholder={categoryName ? `${categoryName} (current category)` : "Choose a category"}
        searchable
        searchLabel="Search categories"
        searchPlaceholder="Search a category or group"
        value={categoryId}
      />
      <p className="text-xs text-[var(--muted)]">Choose a category from its group.</p>
    </div>
  );
}
