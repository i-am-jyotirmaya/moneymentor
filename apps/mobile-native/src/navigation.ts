import type { NativeStackScreenProps } from '@react-navigation/native-stack';
export type Routes = {
  Home: undefined; Composer: undefined; Edit: undefined;
  Picker: { kind: 'account' | 'category' | 'payment' | 'visibility'; target?: 'manual' | 'edit' };
  AddAccount: undefined;
};
export type ScreenProps<T extends keyof Routes> = NativeStackScreenProps<Routes, T>;
