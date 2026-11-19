import { createContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, StyleSheet,
  Text as NativeText, useWindowDimensions, View, type AccessibilityActionEvent,
} from 'react-native';
import {
  GestureDetector, GestureHandlerRootView, GestureStateManager, useNativeGesture,
  usePanGesture, type PanGestureConfig,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, ReduceMotion, useAnimatedKeyboard, useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue,
  useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { spring, timing } from './motion';
import { Text } from './Text';
import type { ThemeValue } from './ThemeProvider';
import { useThemedStyles } from './useThemedStyles';

type SheetSnap = 'content' | 'tall';

export const SheetHeadingContext = createContext(false);

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  snap?: SheetSnap;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  returnFocusRef?: RefObject<Parameters<typeof findNodeHandle>[0]>;
  testID?: string;
};

export function shouldCloseOnRelease(translationY: number, velocityY: number, height: number) {
  'worklet';
  return velocityY > 800 || translationY > height * 0.4;
}

export function rubberBand(dy: number) {
  'worklet';
  return dy < 0 ? dy * 0.3 : dy;
}

export function sheetMaxHeight(windowHeight: number, _snap: SheetSnap = 'content') {
  return windowHeight * 0.9;
}

const sheetSpring = { ...spring.sheet, overshootClamping: true };
const openTiming = timing('base', 'standard');
const closeTiming = timing('base', 'accelerate');
const fadeTiming = { ...timing('fast'), reduceMotion: ReduceMotion.Never };

const makeStyles = ({ color, elevation, radius, space }: ThemeValue) => ({
  root: { flex: 1, justifyContent: 'flex-end' } as const,
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim },
  panel: {
    ...elevation.sheet,
    backgroundColor: color.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handleArea: { alignItems: 'center', justifyContent: 'center', height: 28 } as const,
  handle: { width: 36, height: 4, borderRadius: radius.pill, backgroundColor: color.outlineStrong },
  title: { marginHorizontal: space.s5, marginBottom: space.s3 },
  scrollArea: { flex: 1 },
  footer: { paddingHorizontal: space.s5, paddingTop: space.s3 },
});

function focus(ref: SheetProps['returnFocusRef']) {
  if (!ref?.current) return;
  const handle = findNodeHandle(ref.current);
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
}

export function Sheet({ open, dismissible = true, onClose, returnFocusRef, ...props }: SheetProps) {
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const restoreFocus = useRef(false);

  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open) {
      restoreFocus.current = true;
    } else if (!present && Platform.OS !== 'ios' && restoreFocus.current) {
      const frame = requestAnimationFrame(() => {
        restoreFocus.current = false;
        focus(returnFocusRef);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open, present, returnFocusRef]);

  const dismiss = () => {
    if (open && dismissible) onClose();
  };

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="none"
      visible={present} onRequestClose={dismiss} onShow={() => setShown(true)}
      onDismiss={() => {
        if (!open && !present && restoreFocus.current) {
          restoreFocus.current = false;
          focus(returnFocusRef);
        }
      }}>
      {present && (
        <SheetPanel {...props} open={open} shown={shown} dismissible={dismissible} onClose={dismiss}
          onHidden={() => {
            setShown(false);
            setPresent(false);
          }} />
      )}
    </Modal>
  );
}

function SheetPanel({
  open, shown, title, snap = 'content', children, footer, dismissible, onClose, onHidden, testID,
}: Omit<SheetProps, 'returnFocusRef'> & { shown: boolean; onHidden: () => void }) {
  const s = useThemedStyles(makeStyles);
  const { height: windowHeight } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const maxHeight = sheetMaxHeight(windowHeight, snap);
  const reduced = useReducedMotion();
  const keyboard = useAnimatedKeyboard();
  const titleRef = useRef<React.ComponentRef<typeof NativeText>>(null);
  const [headerHeight, setHeaderHeight] = useState<number>();
  const [contentHeight, setContentHeight] = useState<number>();
  const [footerHeight, setFooterHeight] = useState<number>();
  const measured = headerHeight !== undefined && contentHeight !== undefined && footerHeight !== undefined;
  const height = snap === 'tall' || !measured
    ? maxHeight
    : Math.min(maxHeight, headerHeight + contentHeight + footerHeight);
  const currentHeight = useRef(height);
  const hiddenCallback = useRef(onHidden);
  const initialized = useRef(false);
  const entered = useSharedValue(false);
  const dragEnabled = useDerivedValue(() => open && dismissible === true && entered.value);
  const offset = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(maxHeight);
  const dragOrigin = useSharedValue(0);
  const contentClaimed = useSharedValue(false);
  const touchStart = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    currentHeight.current = height;
    hiddenCallback.current = onHidden;
  }, [height, onHidden]);

  const ready = shown && (snap === 'tall' || measured);
  useEffect(() => {
    let active = true;
    entered.set(false);
    function complete() {
      if (!active) return;
      if (open) {
        entered.set(true);
        focus(titleRef);
      } else {
        hiddenCallback.current();
      }
    }

    if (open && ready) {
      if (!initialized.current) {
        initialized.current = true;
        translateY.set(reduced ? 0 : currentHeight.current);
      }
      if (reduced) {
        translateY.set(0);
        opacity.set(withTiming(1, fadeTiming, finished => {
          if (finished) scheduleOnRN(complete);
        }));
      } else {
        opacity.set(withTiming(1, openTiming));
        translateY.set(withSpring(0, sheetSpring, finished => {
          if (finished) scheduleOnRN(complete);
        }));
      }
    } else if (!open) {
      if (!initialized.current) {
        scheduleOnRN(complete);
      } else if (reduced) {
        translateY.set(0);
        opacity.set(withTiming(0, fadeTiming, finished => {
          if (finished) scheduleOnRN(complete);
        }));
      } else {
        opacity.set(withTiming(0, closeTiming));
        translateY.set(withTiming(currentHeight.current, closeTiming, finished => {
          if (finished) scheduleOnRN(complete);
        }));
      }
    }
    return () => { active = false; };
  }, [entered, open, opacity, ready, reduced, translateY]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: reduced ? opacity.value : Number(opacity.value > 0),
    transform: [{ translateY: translateY.value - keyboard.height.value }],
  }));
  const trackScroll = useAnimatedScrollHandler(event => {
    offset.value = event.contentOffset.y;
  });
  const scrollGesture = useNativeGesture({});
  const startDrag: NonNullable<PanGestureConfig['onActivate']> = () => {
    'worklet';
    cancelAnimation(translateY);
    const y = translateY.value;
    dragOrigin.value = y < 0 ? y / 0.3 : y;
  };
  const updateDrag: NonNullable<PanGestureConfig['onUpdate']> = event => {
    'worklet';
    if (entered.value) translateY.set(rubberBand(dragOrigin.value + event.translationY));
  };
  const endDrag: NonNullable<PanGestureConfig['onDeactivate']> = event => {
    'worklet';
    if (!entered.value) return;
    if (!event.canceled && shouldCloseOnRelease(translateY.value, event.velocityY, height)) {
      scheduleOnRN(onClose);
    } else {
      translateY.set(withSpring(0, sheetSpring));
    }
  };
  const handlePan = usePanGesture({
    enabled: dragEnabled,
    maxPointers: 1,
    activeOffsetY: [-5, 5],
    onActivate: startDrag,
    onUpdate: updateDrag,
    onDeactivate: endDrag,
  });
  // Let native scrolling proceed unless a downward drag starts at the top.
  const contentPan = usePanGesture({
    enabled: dragEnabled,
    maxPointers: 1,
    onActivate: startDrag,
    onUpdate: updateDrag,
    onDeactivate: endDrag,
    manualActivation: true,
    block: scrollGesture,
    onTouchesDown: event => {
      'worklet';
      contentClaimed.value = false;
      const touch = event.allTouches[0];
      if (!touch || event.numberOfTouches !== 1 || offset.value > 0) {
        GestureStateManager.fail(event.handlerTag);
      } else {
        touchStart.value = { x: touch.absoluteX, y: touch.absoluteY };
      }
    },
    onTouchesMove: event => {
      'worklet';
      const touch = event.allTouches[0];
      if (!touch || contentClaimed.value) return;
      const dx = touch.absoluteX - touchStart.value.x;
      const dy = touch.absoluteY - touchStart.value.y;
      if (offset.value > 0 || dy < -5 || (Math.abs(dx) > 5 && Math.abs(dx) > dy)) {
        GestureStateManager.fail(event.handlerTag);
      } else if (dy > 5) {
        contentClaimed.value = true;
        GestureStateManager.activate(event.handlerTag);
      }
    },
  });

  const canDismiss = open && dismissible;
  const escapeProps = canDismiss ? {
    accessibilityActions: [{ name: 'escape' as const, label: 'Close' }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'escape') onClose();
    },
    onAccessibilityEscape: onClose,
  } : undefined;
  // React 19 passes ref through Text's props to the underlying NativeText.
  const titleRefProps = { ref: titleRef };
  return (
    <GestureHandlerRootView style={s.root}>
      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} disabled={!canDismiss} onPress={onClose}
          accessibilityLabel="Close" importantForAccessibility="no" />
      </Animated.View>
      <Animated.View testID={testID} style={[s.panel, { height }, panelStyle]}
        pointerEvents={open ? 'auto' : 'none'} accessibilityViewIsModal
        {...escapeProps}>
        <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
          <GestureDetector gesture={handlePan}>
            <View style={s.handleArea}>
              <View style={s.handle} />
            </View>
          </GestureDetector>
          <Text {...titleRefProps} {...escapeProps} accessible variant="titleL" accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        </View>
        <GestureDetector gesture={contentPan}>
          <View style={s.scrollArea}>
            <GestureDetector gesture={scrollGesture}>
              <Animated.ScrollView style={s.scrollArea} onScroll={trackScroll} scrollEventThrottle={16}
                onContentSizeChange={(_, h) => setContentHeight(h)} bounces={false}
                keyboardShouldPersistTaps="handled">
                <SheetHeadingContext.Provider value={true}>{children}</SheetHeadingContext.Provider>
              </Animated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>
        <View onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} style={{ paddingBottom: bottom }}>
          {footer != null && <View style={s.footer}>{footer}</View>}
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}
