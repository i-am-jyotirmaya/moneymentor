import { bottomSections, isBottomSection, moreSections, sections } from '../src/workspace/navigation';

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
