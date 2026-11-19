// TODO(A2): replace with the HANDOFF `Icon` (src/ui/Icon.tsx) once ForgeDev ships it.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View, useWindowDimensions } from 'react-native';
import { iconGlyphSize } from '../../workspace/ui';

export type IconName = SymbolViewProps['name'];
export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  const { fontScale } = useWindowDimensions();
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <SymbolView name={name} size={Platform.OS === 'android' ? iconGlyphSize(size, fontScale) : size} style={{ width: size, height: size }} tintColor={color} />
  </View>;
}
