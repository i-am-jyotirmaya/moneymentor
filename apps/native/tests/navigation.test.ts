import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeDockRoute, bottomSections, dockRoutes, householdA11yLabel, isBottomSection, moreSections, pillOffset, sections, showHouseholdRole } from '../src/workspace/navigation';

test('More contains secondary sections only and every workspace route has one navigation entry', () => {
  expect(moreSections.map(item => item.section)).toEqual(['reports', 'planning', 'household', 'settings']);
  const entries = [...bottomSections, ...moreSections.map(item => item.section)];
  expect(entries).toHaveLength(sections.length);
  expect(new Set(entries)).toEqual(new Set(sections.map(item => item.section)));
});

test.each(['assistant', 'transactions', 'dashboard'])('%s is a direct tab', section => {
  expect(isBottomSection(section)).toBe(true);
});

test.each(['reports', 'planning', 'household', 'settings', 'unknown'])('%s is not a direct tab', section => {
  expect(isBottomSection(section)).toBe(false);
});

test('Tabs declares a screen for each workspace route file in section order', () => {
  const shell = readFileSync(join(__dirname, '../src/workspace/shell.tsx'), 'utf8');
  const tabs = shell.match(/<Tabs\s[^]*?<\/Tabs>/)?.[0];
  expect(tabs).toMatch(/\{sections\.map\(\(\{ section \}\) => <Tabs\.Screen key=\{section\} name=\{section\}(?: options=\{sceneOptions\(section\)\})? \/>\)\}/);

  const routeFiles = readdirSync(join(__dirname, '../app/(tabs)'))
    .filter(file => /\.[jt]sx?$/.test(file) && !file.startsWith('_layout.'))
    .map(file => file.replace(/\.[jt]sx?$/, ''));
  expect(sections.map(({ section }) => section).sort()).toEqual(routeFiles.sort());
});

test('dock keeps More active while its sheet is open and for More routes', () => {
  expect(activeDockRoute('dashboard', false)).toBe('dashboard');
  expect(activeDockRoute('assistant', false)).toBe('assistant');
  expect(activeDockRoute('dashboard', true)).toBe('more');
  for (const item of moreSections) expect(activeDockRoute(item.section, false)).toBe('more');
  expect(dockRoutes).toEqual(['assistant', 'transactions', 'dashboard', 'more']);
});

test('dock pill is centred in equal-width items', () => {
  expect(pillOffset(400, 0)).toBe(18);
  expect(pillOffset(400, 3)).toBe(318);
  expect(pillOffset(400, 2, 4, 64) + 32).toBe(250);
});

test('household line names the role for TalkBack and drops it visually at large font scales', () => {
  expect(householdA11yLabel('Sahu family', true)).toBe('Household, Sahu family, can write. Switch household');
  expect(householdA11yLabel('Sahu family', false)).toBe('Household, Sahu family, read only. Switch household');
  expect(showHouseholdRole(1.3)).toBe(true);
  expect(showHouseholdRole(1.5)).toBe(false);
});
