import type { ReactNode } from 'react';
import {
  HouseholdSheet, initialsFor, ListRow, MoreSheet, roleLabel, rubberBand, Sheet,
  sheetMaxHeight, shouldCloseOnRelease,
} from '../src/ui';

// The UI barrel also exports charts backed by native Skia.
jest.mock('../src/ui/charts', () => ({}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
// Sheet's native gesture hooks are loaded by the barrel but aren't used by these renders.
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// Render native host elements as HTML so the static renderer can inspect their labels.
jest.mock('react-native/Libraries/Components/View/View', () => ({
  __esModule: true,
  default: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div>,
}));
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  type MockHostProps = {
    children?: import('react').ReactNode;
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
  };
  return Object.create(native, {
    Text: { value: ({ children }: MockHostProps) => <span>{children}</span> },
    Pressable: {
      value: ({ children, accessibilityLabel, accessibilityState }: MockHostProps) => (
        <button aria-label={accessibilityLabel} aria-selected={accessibilityState?.selected}>{children}</button>
      ),
    },
  });
});

const { renderToStaticMarkup } = jest.requireActual<{
  renderToStaticMarkup: (node: ReactNode) => string;
}>('react-dom/server.node');

test.each([
  [0, 801, 500, true],
  [201, 0, 500, true],
  [200, 800, 500, false],
  [20, 50, 500, false],
  [-50, -900, 500, false],
])('drag release at %s dp and %s dp/s for a %s dp sheet closes: %s',
  (translation, velocity, height, closes) => {
    expect(shouldCloseOnRelease(translation, velocity, height)).toBe(closes);
  });

test.each([[-100, -30], [0, 0], [80, 80]])('rubber-bands %s dp to %s dp', (dy, expected) => {
  expect(rubberBand(dy)).toBe(expected);
});

test.each(['content', 'tall'] as const)('%s sheets are capped at 90%% of the window', snap => {
  expect(sheetMaxHeight(800, snap)).toBe(720);
});

test.each([
  ['Jyotirmaya Sahu', 'JS'],
  ['Jyotirmaya', 'J'],
  ['  jyotirmaya   sahu  ', 'JS'],
  ['  ', ''],
])('derives initials for "%s"', (name, initials) => {
  expect(initialsFor(name)).toBe(initials);
});

test.each([
  ['owner', 'Owner'],
  ['write', 'Can write'],
  ['read', 'Read only'],
  ['Guest', 'Guest'],
])('labels %s access as "%s"', (role, label) => {
  expect(roleLabel(role)).toBe(label);
});

test('exports Sheet and ListRow through the UI barrel', () => {
  expect(Sheet).toEqual(expect.any(Function));
  expect(ListRow).toEqual(expect.any(Function));
});

test('renders the More profile, unread count and sign-out action', () => {
  const markup = renderToStaticMarkup(
    <MoreSheet user={{ name: 'Jyotirmaya Sahu', email: 'jyoti@sahu.example', plan: 'Free' }}
      items={[{ key: 'judgments', icon: { ios: 'flag', android: 'flag' }, label: 'Judgments', badge: 2 }]}
      onSelect={jest.fn()} onSignOut={jest.fn()} />,
  );

  for (const label of ['Jyotirmaya Sahu', 'jyoti@sahu.example', 'Free', 'Judgments, 2 new', 'Sign out']) {
    expect(markup).toContain(label);
  }
});

test('renders household permissions, member counts and the create action', () => {
  const markup = renderToStaticMarkup(
    <HouseholdSheet currentId="family" onSelect={jest.fn()} onCreate={jest.fn()}
      households={[
        { id: 'family', name: 'Sahu family', kind: 'Family', role: 'write', members: 3 },
        { id: 'flat', name: 'Flat 4B', kind: 'Family', role: 'read', members: 4 },
      ]} />,
  );

  for (const label of ['Switch household', '3 members', 'Can write', 'Read only', 'New household']) {
    expect(markup).toContain(label);
  }
  expect(markup).toContain('aria-selected="true"');
});
