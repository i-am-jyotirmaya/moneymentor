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
export const moreSections = sections.filter(item => !isBottomSection(item.section));
export function isBottomSection(section: string): section is typeof bottomSections[number] {
  return bottomSections.some(item => item === section);
}
export function sectionLabel(section: string) {
  return sections.find(item => item.section === section)?.label ?? 'Dashboard';
}
export function bottomLabel(section: Section) {
  return sectionLabel(section);
}
export const dockRoutes = [...bottomSections, 'more'] as const;
export type DockRoute = typeof dockRoutes[number];
/** More stays active while its sheet is open and for every route reached from it. */
export function activeDockRoute(active: string, moreOpen: boolean): DockRoute {
  return moreOpen || !isBottomSection(active) ? 'more' : active;
}
/** Left edge of the indicator pill, centred in equal-width dock items. */
export function pillOffset(dockWidth: number, index: number, count: number = dockRoutes.length, pill = 64) {
  const item = dockWidth / count;
  return item * index + (item - pill) / 2;
}
export function householdA11yLabel(name: string, canWrite: boolean) {
  return `Household, ${name}, ${canWrite ? 'can write' : 'read only'}. Switch household`;
}
/** The role drops from the visible line at fontScale >= 1.5; it stays in the a11y name. */
export function showHouseholdRole(fontScale: number) {
  return fontScale < 1.5;
}
