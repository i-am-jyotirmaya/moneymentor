export type DropdownOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Branches are headings by default; set true to allow selecting a branch. */
  selectable?: boolean;
  children?: readonly DropdownOption[];
};

export type DropdownRow = {
  option: DropdownOption;
  depth: number;
  path: string;
  ancestors: readonly string[];
  disabled: boolean;
  selectable: boolean;
};

export function flattenDropdownOptions(options: readonly DropdownOption[]): DropdownRow[] {
  const rows: DropdownRow[] = [];
  function visit(items: readonly DropdownOption[], ancestors: string[], labels: string[], disabled: boolean) {
    for (const option of items) {
      const path = [...labels, option.label];
      const row = {
        option, depth: ancestors.length, path: path.join(" › "), ancestors,
        disabled: disabled || Boolean(option.disabled),
        selectable: option.selectable ?? !option.children?.length,
      };
      rows.push(row);
      if (option.children?.length) {
        visit(option.children, [...ancestors, option.value], path, row.disabled);
      }
    }
  }
  visit(options, [], [], false);
  return rows;
}

/** Search the supplied tree only, retaining the ancestors of matching options. */
export function filterDropdownRows(rows: readonly DropdownRow[], query: string): DropdownRow[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [...rows];
  const matches = rows.filter((row) => `${row.path} ${row.option.description ?? ""}`.toLocaleLowerCase().includes(search));
  const included = new Set(matches.flatMap((row) => [row.option.value, ...row.ancestors]));
  const matchingValues = new Set(matches.map((row) => row.option.value));
  return rows.filter((row) => included.has(row.option.value)).map((row) =>
    matchingValues.has(row.option.value) ? row : { ...row, selectable: false },
  );
}
