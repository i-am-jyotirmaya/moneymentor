# Shared dropdown

`apps/web/app/_components/dropdown.tsx` exports a controlled, single-selection `Dropdown`. It is shared by the web and mobile applications. Import it from a client component. Category and Visibility in the transaction editor use it; other screens can adopt the same component.

## Flat options, without search

```tsx
<Dropdown
  label="Visibility"
  value={visibility}
  onChange={(value) => setVisibility(value)}
  options={[
    { value: "Private", label: "Private" },
    { value: "Household", label: "Household" },
  ]}
/>
```

## Nested options, with search

```tsx
<Dropdown
  label="Category"
  value={categoryId}
  onChange={(value, option) => setCategoryId(value)}
  searchable
  searchPlaceholder="Search a category or group"
  options={[
    {
      value: "food", label: "Food", children: [
        {
          value: "dining", label: "Dining", children: [
            { value: "restaurants", label: "Restaurants", description: "Meals out" },
            { value: "coffee", label: "Coffee" },
          ],
        },
      ],
    },
  ]}
/>
```

Options can be nested to any depth. Branches appear as headings by default. Set `selectable: true` to allow selecting a branch, or `selectable: false` for a leaf heading. Values must be unique across the supplied tree, even when labels repeat. Disabling a branch disables its descendants. The selected trigger displays the full path to distinguish repeated labels.

Search is opt-in and exists only inside the open panel. It filters the supplied options' labels, ancestor paths, and descriptions locally; it performs no network requests and offers no free-text creation. Non-matching ancestors remain as contextual headings. Search never changes the selection and is cleared on close/reopen. Hidden or unauthorized options should be removed by the caller before passing the tree, as the category adapter does.

## Customization

| Prop | Purpose |
| --- | --- |
| `label`, `placeholder` | Accessible field label and text when the value is absent. |
| `searchable`, `searchLabel`, `searchPlaceholder` | Enable search and customize its accessible name and hint. |
| `emptyMessage`, `noResultsMessage` | Distinguish an empty option tree from an unsuccessful search. |
| `className`, `triggerClassName`, `panelClassName` | Customize the field, trigger, and rounded panel. |
| `maxPanelHeight` | Limit the scrollable panel height; defaults to 320 pixels. |
| `renderOption(option, { depth, selected })` | Render custom option content such as icons, badges, or descriptions. |
| `renderValue(option, path)` | Customize the selected content shown in the trigger. |
| `disabled` | Disable the control and close any open panel. |

The panel uses the app's color variables, rounded corners, selection checks, and active-row feedback. It scrolls independently, flips above the trigger when needed, and fits the visual viewport. A portal inside the current dialog plus the browser Popover API prevents clipping while keeping the panel interactive inside modal dialogs. Without Popover support, it uses a fixed-position panel in the same host.

Keyboard behavior: Enter/Space or Arrow Up/Down open the control; arrows navigate enabled options; Home/End select the first/last active row; Enter commits; Escape closes the panel and restores trigger focus; Tab closes and continues through the form. Home/End retain caret behavior in the search input. Non-searchable dropdowns support buffered type-ahead. Disabled rows are skipped.

## Tests

`tests/dropdown-options.spec.ts` covers flat/nested trees, search context, duplicate labels, disabled descendants, and input immutability. Transaction editor browser tests cover searchable and normal panels on desktop/mobile, selection persistence, search reset, keyboard focus, dismissal, viewport placement, and disabled triggers during saving.

Run the relevant suites:

```sh
cd apps/web
pnpm exec playwright test tests/dropdown-options.spec.ts tests/money-mentor.spec.ts
```
