import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { layout } from '../ui/theme';

/** Dock height plus its 4dp top and 12dp bottom inset (HANDOFF B1). The safe-area bottom inset is applied by the shell. */
export const DOCK_SPACE = layout.navHeight + 4 + 12;

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

/** Bottom padding a revamped screen needs so its last content clears the floating dock (0 while the IME hides the dock). */
export function useDockSpace() {
  return useKeyboardVisible() ? 0 : DOCK_SPACE;
}
