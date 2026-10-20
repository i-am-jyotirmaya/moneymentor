import 'react-native-gesture-handler/jestSetup';
jest.mock('@react-navigation/elements', () => ({ ...jest.requireActual('@react-navigation/elements'), useHeaderHeight: () => 96 }));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: {
  abort: jest.fn(), stop: jest.fn(), start: jest.fn(), isRecognitionAvailable: jest.fn(() => false),
  supportsOnDeviceRecognition: jest.fn(() => true), requestPermissionsAsync: jest.fn(),
}, useSpeechRecognitionEvent: jest.fn() }));
