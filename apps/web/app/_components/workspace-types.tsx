import type {
  CategoryCatalogResponse,
  Commitment,
  Goal,
  HouseholdDashboard,
  HouseholdInvitation,
  HouseholdRole,
  MonthlyDashboardResponse,
  TransactionListItem,
  TransactionPageResponse,
  TransactionVisibility,
  UserPlan,
} from "@/lib/api";
import { FormEvent, RefObject } from "react";
import { type TransactionEditForm } from "../_hooks/use-transaction-state";

export type InputMode = import("@/lib/assistant-input").AssistantInputMode;
export type ImagePreview = {
  scope: string;
  currencyCode?: string;
  status: "selected" | "reading" | "parsed" | "needs-confirmation" | "failed";
  previewUrl?: string;
  progress?: number;
  input?: import("@/lib/assistant-input").AssistantInput;
  result?: import("@/lib/api").AssistantMessageResponse;
  error?: string;
};
export type ImageComposerProps = {
  imagePreview: ImagePreview | null;
  onImage: (image: Blob) => void;
  onConfirmImage: () => void;
  onEditImage: () => void;
  onDismissImage: () => void;
};

export type AppSection =
  | "home"
  | "dashboard"
  | "assistant"
  | "transactions"
  | "reports"
  | "planning"
  | "household"
  | "settings";

export type MoneyMentorHomeProps = {
  initialSection?: AppSection;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type SettingsForm = {
  currencyCode: string;
  timeZone: string;
  plan: UserPlan;
  requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: TransactionVisibility;
};

export type SectionRenderProps = ImageComposerProps & {
  accessToken: string;
  allowHouseholdReportScope: boolean;
  canWriteSelectedHousehold: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  categoryCatalog: CategoryCatalogResponse | null;
  commitments: Commitment[];
  dashboard: MonthlyDashboardResponse | null;
  dashboardMonth: string;
  editForm: TransactionEditForm | null;
  deletedTransactions: TransactionListItem[];
  deletionConfirmation: string;
  deletionPassword: string;
  householdName: string;
  goals: Goal[];
  households: HouseholdDashboard | null;
  householdInvitations: HouseholdInvitation[];
  sentHouseholdInvitations: HouseholdInvitation[];
  householdNotice: string | null;
  inputMode: InputMode;
  isListening: boolean;
  isLoadingDashboard: boolean;
  isLoadingTransactions: boolean;
  isPrivacyWorking: boolean;
  isSavingHousehold: boolean;
  isSavingSettings: boolean;
  isSavingTransaction: boolean;
  isSubmitting: boolean;
  memberEmail: string;
  memberRole: HouseholdRole;
  messages: Message[];
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onDashboardMonthChange: (month: string) => void;
  onCloseEdit: () => void;
  onCreateHousehold: (event: FormEvent<HTMLFormElement>) => void;
  onSaveHouseholdSettings: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteTransaction: (transaction: TransactionListItem) => void;
  onDeletionConfirmationChange: (value: string) => void;
  onDeletionPasswordChange: (value: string) => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onFormChange: (form: SettingsForm) => void;
  onHouseholdNameChange: (value: string) => void;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (role: HouseholdRole) => void;
  onInvitationResponse: (
    invitationId: string,
    response: "accept" | "decline",
  ) => void;
  onExportData: () => void;
  onPromptClick: (idea: string) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTransaction: (event: FormEvent<HTMLFormElement>) => void;
  onRestoreTransaction: (transaction: TransactionListItem) => void;
  onSelectTransaction: (transaction: TransactionListItem) => void;
  onSelectedHouseholdChange: (householdId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  onTransactionMonthChange: (month: string) => void;
  onTransactionPageChange: (page: number) => void;
  selectedHouseholdId: string | null;
  selectedTransaction: TransactionListItem | null;
  settingsForm: SettingsForm | null;
  text: string;
  transactionMonth: string;
  transactionPage: TransactionPageResponse | null;
  transactions: TransactionListItem[];
};
