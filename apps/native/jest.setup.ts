jest.mock("expo-secure-store", () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
  };
});
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "https://api.spndrr.example" } } },
}));
// The shipped Reanimated mock imports the native initializer under jest-expo.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  const identity = <T>(value: T) => value;
  const transition = {
    duration: () => transition,
    easing: () => transition,
    reduceMotion: () => transition,
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: identity },
    Easing: { bezier: () => identity, linear: identity },
    ReduceMotion: { System: "system" },
    FadeIn: transition,
    FadeOut: transition,
    useReducedMotion: () => false,
    useSharedValue: <T>(initial: T) => ({
      value: initial,
      set(next: T) { this.value = next; },
    }),
    useAnimatedProps: (read: () => unknown) => read(),
    useAnimatedStyle: (read: () => unknown) => read(),
    withSpring: identity,
    withTiming: identity,
    withDelay: (_delay: number, animation: unknown) => animation,
    withRepeat: identity,
    cancelAnimation: jest.fn(),
  };
});
