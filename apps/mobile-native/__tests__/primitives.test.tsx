import { act, fireEvent, render } from '@testing-library/react-native';
import { CalendarField, ChoiceField, MoneyField, Toggle } from '../src/ui/forms';
import { CategoryChart, FinancialSkeleton, Progress } from '../src/ui/finance';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));

test('native choice search retains an exact account identity and closes after selection', async () => {
  const changed = jest.fn(); const screen = render(<ChoiceField label="Account" value={null} onChange={changed} options={[
    { id: 'bank', label: 'Kotak', detail: 'Bank account' }, { id: 'card', label: 'Kotak upi', detail: 'Credit card' },
  ]} />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Account: Choose…'));
  fireEvent.changeText(screen.getByLabelText('Search account'), 'upi');
  expect(screen.queryByRole('radio', { name: 'Kotak, Bank account' })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'Kotak upi, Credit card' }));
  expect(changed).toHaveBeenCalledWith('card'); expect(screen.queryByRole('radio')).toBeNull();
});
test('choice empty results and disabled currency inputs remain accessible', async () => {
  const screen = render(<ChoiceField label="Category" value={null} onChange={jest.fn()} options={[]} />);
  await act(async () => {});
  fireEvent.press(screen.getByLabelText('Category: Choose…'));
  expect(screen.getByText('No matching options.')).toBeTruthy();
  screen.unmount();
  const money = render(<MoneyField label="Target amount" currency="INR" value="45.50" onChange={jest.fn()} disabled />);
  expect(money.getByLabelText('Target amount (INR)').props.editable).toBe(false);
  expect(money.getByLabelText('Target amount (INR)').props.value).toBe('45.50');
});
test('optional dates clear explicitly and native privacy switches report their change', () => {
  const changeDate = jest.fn(); const changed = jest.fn();
  const screen = render(<CalendarField label="Target date" value="2026-12-20" today="2026-10-20" optional allowFuture onChange={changeDate} />);
  fireEvent.press(screen.getByText('Clear target date')); expect(changeDate).toHaveBeenCalledWith('');
  screen.unmount();
  const toggle = render(<Toggle label="Share with household" value={false} onChange={changed} />);
  fireEvent(toggle.getByLabelText('Share with household'), 'valueChange', true); expect(changed).toHaveBeenCalledWith(true);
});
test('progress clamps visual/accessibility ratios without changing authoritative amounts', async () => {
  const screen = render(<Progress label="Goal progress" value={1.5} animate={false} />);
  await act(async () => {});
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
  screen.rerender(<Progress label="Goal progress" value={Number.NaN} animate={false} />);
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(0);
});
test('category detail preserves negative net refunds and exposes an expandable chart row', async () => {
  const screen = render(<CategoryChart currency="INR" animate={false} categories={[
    { name: 'Groceries', parentCategoryName: 'Food', amount: -20.25, budget: 100, tone: 'Healthy', note: 'Server-calculated total' },
  ]} />);
  await act(async () => {});
  const row = screen.getByRole('button', { name: /Groceries,.*net refund/ });
  expect(row.props.accessibilityState.expanded).toBe(false); fireEvent.press(row);
  expect(screen.getByText('Server-calculated total')).toBeTruthy();
  expect(screen.getByText('Food · Net refund this period')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Groceries,.*net refund/ }).props.accessibilityState.expanded).toBe(true);
});
test('financial loading has a screen-reader label without an expensive shimmer loop', () => {
  const screen = render(<FinancialSkeleton />);
  expect(screen.getByRole('progressbar', { name: 'Loading financial summary' })).toBeTruthy();
});
