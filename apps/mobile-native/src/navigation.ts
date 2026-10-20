import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
export type Routes = {
  Home: undefined; Composer: undefined; Edit: undefined;
  Picker: { kind: 'account' | 'category' | 'payment' | 'visibility'; target?: 'manual' | 'edit' };
  AddAccount: undefined;
  Transactions: undefined; Transaction: { id: string }; FinancialEvent: { originalId?: string; kind?: 'Refund' | 'Reversal' } | undefined;
  Accounts: undefined; AccountForm: { id?: string } | undefined; Categories: undefined; CategoryForm: { id?: string } | undefined;
  Goals: undefined; Goal: { id: string }; GoalForm: { id?: string } | undefined;
  Commitments: undefined; CommitmentForm: { id?: string } | undefined;
  Insights: undefined; Households: undefined; Settings: undefined;
  AssistantHistory: undefined;
};
export type ScreenProps<T extends keyof Routes> = NativeStackScreenProps<Routes, T>;
export type FeatureNavigationProps = { navigation: Pick<NativeStackNavigationProp<Routes>, 'navigate'> };
