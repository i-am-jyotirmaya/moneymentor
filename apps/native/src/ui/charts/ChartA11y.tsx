import type { ReactNode } from 'react';
import { View } from 'react-native';

export function ChartA11y({ label, onIncrement, onDecrement, children }: {
  label: string; onIncrement?: () => void; onDecrement?: () => void; children: ReactNode;
}) {
  const actions = [
    ...(onIncrement ? [{ name: 'increment' as const }] : []),
    ...(onDecrement ? [{ name: 'decrement' as const }] : []),
  ];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}
      accessibilityActions={actions.length ? actions : undefined}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'increment') onIncrement?.();
        if (nativeEvent.actionName === 'decrement') onDecrement?.();
      }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </View>
  );
}
