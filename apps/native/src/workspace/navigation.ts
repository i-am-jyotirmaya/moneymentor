export const sections = [
  { section: 'dashboard', label: 'Dashboard' },
  { section: 'assistant', label: 'Assistant' },
  { section: 'transactions', label: 'Transactions' },
  { section: 'reports', label: 'Judgments' },
  { section: 'planning', label: 'Planning' },
  { section: 'household', label: 'Household' },
  { section: 'settings', label: 'Settings' },
] as const;
export type Section = typeof sections[number]['section'];
export const bottomSections = ['assistant', 'transactions', 'dashboard'] as const;
export function sectionLabel(section: string) {
  return sections.find(item => item.section === section)?.label ?? 'Dashboard';
}
export function bottomLabel(section: Section) {
  return section === 'assistant' ? 'Track' : sectionLabel(section);
}
