"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Send,
  Settings,
  Trash2,
  Download,
  Flag,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  FormEvent,
  RefObject,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  AssistantMessageResponse,
  CategoryCatalogResponse,
  CategorySpendSummary,
  Commitment,
  DashboardInsight,
  DashboardJudgement,
  Goal,
  GoalDetail,
  GoalPlanPace,
  GoalPlanVersion,
  GoalPlanningRun,
  HouseholdDashboard,
  HouseholdInvitation,
  HouseholdRole,
  MonthlyDashboardResponse,
  TransactionListItem,
  TransactionPageResponse,
  TransactionVisibility,
  UpdateUserSettingsRequest,
  UserPlan,
  UserSettingsResponse,
} from "@/lib/api";
import {
  ApiError,
  acceptPrivacyConsent,
  activateGoalPlan,
  createGoal,
  createGoalPlanningRun,
  createHousehold,
  createHouseholdInvitation,
  deleteAccount,
  deleteTransaction,
  downloadPrivacyExport,
  getMonthlyDashboard,
  getGoal,
  getGoalPlanningRun,
  getUserSettings,
  listCategories,
  listCommitments,
  listGoals,
  listHouseholdInvitations,
  listSentHouseholdInvitations,
  listDeletedTransactions,
  listHouseholds,
  listTransactions,
  logout,
  putGoalParticipantConsent,
  deleteGoalParticipantConsent,
  customizeGoalPlan,
  reviewGoalPlan,
  refreshSession,
  respondToHouseholdInvitation,
  restoreTransaction,
  submitAssistantMessage as sendAssistantMessage,
  updateTransaction,
  updateHouseholdSettings,
  updateUserSettings,
} from "@/lib/api";
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  saveAuthSession,
  subscribeToAuthSession,
} from "@/lib/auth-session";
import { useHouseholdScopeState } from "../_hooks/use-household-scope-state";
import { usePrivacyState } from "../_hooks/use-privacy-state";
import {
  type TransactionEditForm,
  useTransactionState,
} from "../_hooks/use-transaction-state";
import { BrandMarkIcon } from "./icons";
import { JudgementReportsPanel } from "./judgement-reports-panel";

type InputMode = "Text" | "Voice";
export type AppSection = "home" | "dashboard" | "assistant" | "transactions" | "reports" | "planning" | "household" | "settings";

type MoneyMentorHomeProps = {
  initialSection?: AppSection;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type SettingsForm = {
  currencyCode: string;
  timeZone: string;
  plan: UserPlan;
  requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: TransactionVisibility;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0?: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const promptIdeas = [
  "groceries for 110 from local market",
  "Joe sent me 300 Rs for chips",
  "where did I spend most this month?",
];

const transactionPageSize = 10;

const navItems: Array<{
  section: Exclude<AppSection, "home">;
  label: string;
  icon: typeof Bot;
}> = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "assistant", label: "Assistant", icon: Bot },
  { section: "transactions", label: "Transactions", icon: ReceiptText },
  { section: "reports", label: "Reports", icon: BarChart3 },
  { section: "planning", label: "Planning", icon: Flag },
  { section: "household", label: "Household", icon: Users },
  { section: "settings", label: "Settings", icon: Settings },
];

export function MoneyMentorHome({ initialSection = "home" }: MoneyMentorHomeProps) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionSnapshot,
    () => null,
  );
  const [activeSection, setActiveSection] = useState<AppSection>(initialSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopAssistantOpen, setDesktopAssistantOpen] = useState(false);
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("Text");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "seed-assistant",
      role: "assistant",
      text: "Tell me what you spent or received, or ask where your money went this month.",
    },
  ]);
  const {
    transactions,
    setTransactions,
    transactionPage,
    setTransactionPage,
    transactionMonth,
    setTransactionMonth,
    selectedTransactionId,
    setSelectedTransactionId,
    editForm,
    setEditForm,
    deletedTransactions,
    setDeletedTransactions,
    undoTransaction,
    setUndoTransaction,
    isLoadingTransactions,
    setIsLoadingTransactions,
    isSavingTransaction,
    setIsSavingTransaction,
  } = useTransactionState(getCurrentMonthKey());
  const [dashboardMonth, setDashboardMonth] = useState(getCurrentMonthKey);
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm | null>(null);
  const {
    households,
    setHouseholds,
    householdInvitations,
    setHouseholdInvitations,
    sentHouseholdInvitations,
    setSentHouseholdInvitations,
    householdNotice,
    setHouseholdNotice,
    selectedHouseholdId,
    setSelectedHouseholdId,
    householdName,
    setHouseholdName,
    memberEmail,
    setMemberEmail,
    memberRole,
    setMemberRole,
    isSavingHousehold,
    setIsSavingHousehold,
  } = useHouseholdScopeState();
  const [dashboard, setDashboard] = useState<MonthlyDashboardResponse | null>(null);
  const [categoryCatalog, setCategoryCatalog] = useState<CategoryCatalogResponse | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const {
    isAcceptingConsent,
    setIsAcceptingConsent,
    deletionPassword,
    setDeletionPassword,
    deletionConfirmation,
    setDeletionConfirmation,
    isPrivacyWorking,
    setIsPrivacyWorking,
  } = usePrivacyState();
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const desktopSection = activeSection === "home" ? "dashboard" : activeSection;
  const mobileSection = activeSection === "home" ? "assistant" : activeSection;
  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions],
  );
  const income = dashboard?.income ?? 0;
  const spends = dashboard?.spends ?? 0;
  const saved = dashboard?.saved ?? income - spends;
  const currencyCode = settings?.currencyCode ?? dashboard?.currencyCode ?? "INR";
  const selectedHousehold = households?.households.find(
    (household) => household.id === selectedHouseholdId,
  );
  const canWriteSelectedHousehold = selectedHousehold?.canWrite ?? true;
  const greetingName = useMemo(() => {
    const name = session?.user.displayName?.trim();
    return name ? name.split(/\s+/)[0] : "there";
  }, [session]);

  const handleApiError = useCallback(
    (caughtError: unknown, fallbackMessage: string) => {
      if (caughtError instanceof ApiError) {
        if (caughtError.status === 401) {
          clearAuthSession();
          router.push("/login");
          return;
        }

        setError(caughtError.errors.join(" "));
        return;
      }

      setError(fallbackMessage);
    },
    [router],
  );

  const refreshAppData = useCallback(
    async (accessToken: string) => {
      setIsLoadingData(true);
      setError(null);

      try {
        const [settingsResult, householdResult, invitationResult] = await Promise.all([
          getUserSettings(accessToken),
          listHouseholds(accessToken),
          listHouseholdInvitations(accessToken),
        ]);
        const effectiveHouseholdId = householdResult.households.some(
          (household) => household.id === selectedHouseholdId,
        )
          ? selectedHouseholdId!
          : householdResult.defaultHouseholdId;
        const effectiveHousehold = householdResult.households.find(
          (household) => household.id === effectiveHouseholdId,
        );
        const [
          transactionResult,
          dashboardResult,
          trashResult,
          sentInvitationResult,
          categoryResult,
          goalResult,
          commitmentResult,
        ] = await Promise.all([
          listTransactions(accessToken, {
            page: 1,
            pageSize: transactionPageSize,
            householdId: effectiveHouseholdId,
          }),
          getMonthlyDashboard(accessToken, { householdId: effectiveHouseholdId }),
          listDeletedTransactions(accessToken, effectiveHouseholdId),
          effectiveHousehold?.kind === "Family"
            && (effectiveHousehold.role === "Owner" || effectiveHousehold.role === "Admin")
            ? listSentHouseholdInvitations(accessToken, effectiveHouseholdId)
            : Promise.resolve([]),
          listCategories(accessToken, effectiveHouseholdId),
          listGoals(accessToken, effectiveHouseholdId),
          listCommitments(accessToken, effectiveHouseholdId),
        ]);

        setSettings(settingsResult);
        setSettingsForm(toSettingsForm(settingsResult));
        setTransactions(transactionResult.items);
        setTransactionPage(transactionResult);
        setTransactionMonth(transactionResult.month);
        setHouseholds(householdResult);
        setHouseholdInvitations(invitationResult);
        setSentHouseholdInvitations(sentInvitationResult);
        setDeletedTransactions(trashResult.items);
        setDashboard(dashboardResult);
        setCategoryCatalog(categoryResult);
        setGoals(goalResult);
        setCommitments(commitmentResult);
        setDashboardMonth(dashboardResult.month);
        setSelectedHouseholdId(effectiveHouseholdId);
      } catch (caughtError) {
        handleApiError(caughtError, "Could not load your MoneyMentor workspace.");
      } finally {
        setIsLoadingData(false);
      }
    },
    [
      handleApiError,
      selectedHouseholdId,
      setDeletedTransactions,
      setHouseholdInvitations,
      setHouseholds,
      setSelectedHouseholdId,
      setSentHouseholdInvitations,
      setTransactionMonth,
      setTransactionPage,
      setTransactions,
    ],
  );

  useEffect(() => {
    let active = true;
    void refreshSession()
      .catch(() => clearAuthSession())
      .finally(() => {
        if (active) {
          setSessionReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting]);

  useEffect(() => {
    if (!sessionReady || !session || session.requiresPrivacyConsent) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshAppData(session.accessToken);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refreshAppData, session, sessionReady]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  async function signOut() {
    try {
      await logout(session?.accessToken);
    } finally {
      router.push("/login");
    }
  }

  function selectSection(section: Exclude<AppSection, "home">) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  function appendMessage(role: Message["role"], messageText: string) {
    setMessages((current) => [
      ...current,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        text: messageText,
      },
    ]);
  }

  function selectTransaction(transaction: TransactionListItem) {
    setSelectedTransactionId(transaction.id);
    setEditForm(toTransactionEditForm(transaction));
  }

  function closeTransactionEditor() {
    setSelectedTransactionId(null);
    setEditForm(null);
  }

  function getSpeechRecognition() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  }

  function startVoiceInput() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setInputMode("Voice");

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setInputMode("Text");
      setError("Voice input is not available in this browser. You can still type your message.");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setText(transcript);
        void submitChatMessage(transcript, "Voice");
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setInputMode("Text");
      setError("I could not catch that clearly. Try typing it instead.");
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setInputMode("Text");
      setError("Voice input could not start. You can still type your message.");
    }
  }

  function toggleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    startVoiceInput();
  }

  async function submitChatMessage(sourceText: string, mode: InputMode) {
    const normalizedText = sourceText.trim();
    if (!normalizedText || isSubmitting) {
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    if (!canWriteSelectedHousehold && !looksLikeFinanceQuestion(normalizedText)) {
      setError("This household is read-only for Viewers. You can still ask finance questions.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setText("");
    setInputMode(mode);
    appendMessage("user", normalizedText);

    try {
      const result = await sendAssistantMessage(session.accessToken, {
        text: normalizedText,
        inputMode: mode,
        householdId: selectedHouseholdId ?? undefined,
        currencyCode,
        locale: "en-IN",
      });

      appendMessage(
        "assistant",
        result.assistantMessage ?? getFallbackAssistantMessage(result),
      );

      if (result.transaction) {
        setTransactions((current) => [
          result.transaction!,
          ...current.filter((transaction) => transaction.id !== result.transaction!.id),
        ]);
        await refreshDashboardAndTransactions(session.accessToken);
      }
    } catch (caughtError) {
      handleApiError(caughtError, "Could not reach MoneyMentor API. Check that the backend is running.");
    } finally {
      setIsSubmitting(false);
      setInputMode("Text");
    }
  }

  async function refreshDashboardAndTransactions(accessToken: string) {
    const [transactionResult, dashboardResult] = await Promise.all([
      listTransactions(accessToken, {
        month: transactionMonth,
        page: transactionPage?.page ?? 1,
        pageSize: transactionPageSize,
        householdId: selectedHouseholdId ?? undefined,
      }),
      getMonthlyDashboard(accessToken, {
        month: dashboardMonth,
        householdId: selectedHouseholdId ?? undefined,
      }),
    ]);

    setTransactions(transactionResult.items);
    setTransactionPage(transactionResult);
    setDashboard(dashboardResult);
  }

  async function changeDashboardMonth(month: string) {
    if (!session || month === dashboardMonth || isLoadingDashboard) {
      return;
    }

    const previousMonth = dashboardMonth;
    setDashboardMonth(month);
    setIsLoadingDashboard(true);
    setError(null);

    try {
      setDashboard(await getMonthlyDashboard(session.accessToken, {
        month,
        householdId: selectedHouseholdId ?? undefined,
      }));
    } catch (caughtError) {
      setDashboardMonth(previousMonth);
      handleApiError(caughtError, "Could not load that dashboard month.");
    } finally {
      setIsLoadingDashboard(false);
    }
  }

  async function changeTransactionMonth(month: string) {
    if (!session || month === transactionMonth || isLoadingTransactions) {
      return;
    }

    const previousMonth = transactionMonth;
    setTransactionMonth(month);
    setIsLoadingTransactions(true);
    setError(null);
    closeTransactionEditor();

    try {
      const result = await listTransactions(session.accessToken, {
        month,
        page: 1,
        pageSize: transactionPageSize,
        householdId: selectedHouseholdId ?? undefined,
      });
      setTransactions(result.items);
      setTransactionPage(result);
    } catch (caughtError) {
      setTransactionMonth(previousMonth);
      handleApiError(caughtError, "Could not load transactions for that month.");
    } finally {
      setIsLoadingTransactions(false);
    }
  }

  async function changeTransactionPage(page: number) {
    if (!session || isLoadingTransactions || page < 1 || page === transactionPage?.page) {
      return;
    }

    setIsLoadingTransactions(true);
    setError(null);
    closeTransactionEditor();

    try {
      const result = await listTransactions(session.accessToken, {
        month: transactionMonth,
        page,
        pageSize: transactionPageSize,
        householdId: selectedHouseholdId ?? undefined,
      });
      setTransactions(result.items);
      setTransactionPage(result);
    } catch (caughtError) {
      handleApiError(caughtError, "Could not load that transaction page.");
    } finally {
      setIsLoadingTransactions(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitChatMessage(text, inputMode);
  }

  async function handleSaveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !selectedTransaction || !editForm) {
      return;
    }

    const amount = Number.parseFloat(editForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount before saving the transaction.");
      return;
    }

    setIsSavingTransaction(true);
    setError(null);

    try {
      const updated = await updateTransaction(session.accessToken, selectedTransaction.id, {
        amount,
        categoryName: editForm.categoryName,
        ...(selectedTransaction.type === "Income"
          ? { senderName: editForm.senderName, reason: editForm.reason }
          : { merchantName: editForm.merchantName, description: editForm.description }),
        transactionDate: editForm.transactionDate,
        visibility: editForm.visibility,
      });

      setTransactions((current) =>
        current.map((transaction) => (transaction.id === updated.id ? updated : transaction)),
      );
      setEditForm(toTransactionEditForm(updated));
      appendMessage(
        "assistant",
        `Updated ${updated.reason ?? updated.description ?? "that transaction"}.`,
      );
      await refreshDashboardAndTransactions(session.accessToken);
      closeTransactionEditor();
    } catch (caughtError) {
      handleApiError(caughtError, "Could not update the transaction.");
    } finally {
      setIsSavingTransaction(false);
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !settingsForm) {
      return;
    }

    setIsSavingSettings(true);
    setError(null);

    try {
      const payload: UpdateUserSettingsRequest = {
        currencyCode: settingsForm.currencyCode,
        timeZone: settingsForm.timeZone,
        requireMerchantForExpenses: settingsForm.requireMerchantForExpenses,
        defaultTransactionVisibility: settingsForm.defaultTransactionVisibility,
      };
      const updated = await updateUserSettings(session.accessToken, payload);
      setSettings(updated);
      setSettingsForm(toSettingsForm(updated));
      setHouseholds(await listHouseholds(session.accessToken));
      setDashboard(await getMonthlyDashboard(session.accessToken, {
        month: dashboardMonth,
        householdId: selectedHouseholdId ?? undefined,
      }));
    } catch (caughtError) {
      handleApiError(caughtError, "Could not save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleCreateHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !householdName.trim()) {
      return;
    }

    setIsSavingHousehold(true);
    setError(null);
    setHouseholdNotice(null);

    try {
      const created = await createHousehold(session.accessToken, householdName.trim());
      const householdResult = await listHouseholds(session.accessToken);
      setHouseholds(householdResult);
      setSelectedHouseholdId(created.id);
      setHouseholdName("");
      setHouseholdNotice(`${created.name} is ready.`);
    } catch (caughtError) {
      handleApiError(caughtError, "Could not create the household.");
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !selectedHouseholdId || !memberEmail.trim()) {
      return;
    }

    setIsSavingHousehold(true);
    setError(null);
    setHouseholdNotice(null);

    try {
      await createHouseholdInvitation(session.accessToken, selectedHouseholdId, {
        email: memberEmail.trim(),
        role: memberRole,
      });
      setHouseholds(await listHouseholds(session.accessToken));
      setSentHouseholdInvitations(
        await listSentHouseholdInvitations(session.accessToken, selectedHouseholdId),
      );
      setHouseholdNotice(`Invitation sent to ${memberEmail.trim()}.`);
      setMemberEmail("");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not send that household invitation.");
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleSaveHouseholdSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedHouseholdId || isSavingHousehold) return;

    const formData = new FormData(event.currentTarget);
    const currencyCode = String(formData.get("currencyCode") ?? "").trim().toUpperCase();
    const timeZone = String(formData.get("timeZone") ?? "").trim();
    setIsSavingHousehold(true);
    setHouseholdNotice(null);
    setError(null);
    try {
      const updated = await updateHouseholdSettings(
        session.accessToken,
        selectedHouseholdId,
        { currencyCode, timeZone },
      );
      setHouseholds((current) => current ? {
        ...current,
        households: current.households.map((household) =>
          household.id === updated.id ? updated : household),
      } : current);
      setHouseholdNotice("Household reporting settings saved.");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not save household reporting settings.");
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleInvitationResponse(
    invitationId: string,
    response: "accept" | "decline",
  ) {
    if (!session || isSavingHousehold) {
      return;
    }

    setIsSavingHousehold(true);
    setError(null);
    setHouseholdNotice(null);

    try {
      const invitation = await respondToHouseholdInvitation(
        session.accessToken,
        invitationId,
        response,
      );
      const [householdResult, invitationResult] = await Promise.all([
        listHouseholds(session.accessToken),
        listHouseholdInvitations(session.accessToken),
      ]);
      setHouseholds(householdResult);
      setHouseholdInvitations(invitationResult);
      setSelectedHouseholdId((current) =>
        response === "accept" ? invitation.householdId : current,
      );
      setHouseholdNotice(
        response === "accept"
          ? `You joined ${invitation.householdName}.`
          : `Invitation to ${invitation.householdName} declined.`,
      );
    } catch (caughtError) {
      handleApiError(caughtError, `Could not ${response} that household invitation.`);
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleDeleteTransaction(transaction: TransactionListItem) {
    if (!session || !canWriteSelectedHousehold) return;
    setError(null);
    try {
      const deleted = await deleteTransaction(session.accessToken, transaction.id);
      setUndoTransaction(deleted);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      setDeletedTransactions((current) => [
        deleted,
        ...current.filter((item) => item.id !== transaction.id),
      ]);
      await refreshDashboardAndTransactions(session.accessToken);
    } catch (caughtError) {
      handleApiError(caughtError, "Could not move the transaction to trash.");
    }
  }

  async function handleRestoreTransaction(transaction: TransactionListItem) {
    if (!session || !canWriteSelectedHousehold) return;
    setError(null);
    try {
      const restored = await restoreTransaction(session.accessToken, transaction.id);
      setDeletedTransactions((current) => current.filter((item) => item.id !== transaction.id));
      setUndoTransaction((current) => current?.id === transaction.id ? null : current);
      setTransactions((current) => [
        restored,
        ...current.filter((item) => item.id !== restored.id),
      ]);
      await refreshDashboardAndTransactions(session.accessToken);
    } catch (caughtError) {
      handleApiError(caughtError, "Could not restore the transaction.");
    }
  }

  async function handleExportData() {
    if (!session || isPrivacyWorking) return;
    setIsPrivacyWorking(true);
    setError(null);
    try {
      const exported = await downloadPrivacyExport(session.accessToken);
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      handleApiError(caughtError, "Could not export your data.");
    } finally {
      setIsPrivacyWorking(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || isPrivacyWorking) return;
    setIsPrivacyWorking(true);
    setError(null);
    try {
      await deleteAccount(session.accessToken, {
        password: deletionPassword,
        confirmation: deletionConfirmation,
      });
      clearAuthSession();
      router.push("/signup");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not delete your account.");
    } finally {
      setIsPrivacyWorking(false);
    }
  }

  async function handleAcceptConsent() {
    if (!session || isAcceptingConsent) return;
    setIsAcceptingConsent(true);
    setError(null);
    try {
      await acceptPrivacyConsent(session.accessToken);
      saveAuthSession({ ...session, requiresPrivacyConsent: false });
    } catch (caughtError) {
      handleApiError(caughtError, "Could not record privacy consent.");
    } finally {
      setIsAcceptingConsent(false);
    }
  }

  if (!sessionReady) {
    return <LoadingSession />;
  }

  if (!session) {
    return <SignedOutHome />;
  }

  if (session.requiresPrivacyConsent) {
    return <PrivacyConsentGate isSaving={isAcceptingConsent} onAccept={() => void handleAcceptConsent()} onSignOut={() => void signOut()} />;
  }

  return (
    <main className="h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="flex h-full min-h-0">
        <DesktopSidebar
          activeSection={desktopSection}
          income={income}
          onSelectSection={selectSection}
          onSignOut={signOut}
          plan={settings?.plan ?? "Free"}
          saved={saved}
          sessionEmail={session.user.email}
          sessionName={session.user.displayName}
          spends={spends}
          currencyCode={currencyCode}
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <MobileHeader
            activeSection={mobileSection}
            greetingName={greetingName}
            onMenuOpen={() => setMobileMenuOpen(true)}
          />

          <div className="hidden min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:block xl:px-8">
            <HouseholdScopeSelector
              households={households}
              onChange={(householdId) => {
                closeTransactionEditor();
                setSelectedHouseholdId(householdId);
              }}
              selectedHouseholdId={selectedHouseholdId}
            />
            <WorkspaceError error={error} isLoading={isLoadingData} />
            {renderSection(desktopSection, {
              accessToken: session.accessToken,
              allowHouseholdReportScope: selectedHousehold?.kind === "Family",
              chatEndRef,
              dashboard,
              dashboardMonth,
              categoryCatalog,
              goals,
              commitments,
              editForm,
              canWriteSelectedHousehold,
              deletedTransactions,
              deletionConfirmation,
              deletionPassword,
              households,
              householdInvitations,
              sentHouseholdInvitations,
              householdNotice,
              inputMode,
              isListening,
              isLoadingDashboard,
              isLoadingTransactions,
              isSavingHousehold,
              isSavingSettings,
              isSavingTransaction,
              isPrivacyWorking,
              isSubmitting,
              memberEmail,
              memberRole,
              messages,
              onAddMember: handleAddMember,
              onDashboardMonthChange: (month) => void changeDashboardMonth(month),
              onCloseEdit: closeTransactionEditor,
              onCreateHousehold: handleCreateHousehold,
              onSaveHouseholdSettings: handleSaveHouseholdSettings,
              onEditFormChange: setEditForm,
              onHouseholdNameChange: setHouseholdName,
              onMemberEmailChange: setMemberEmail,
              onMemberRoleChange: setMemberRole,
              onInvitationResponse: (invitationId, response) =>
                void handleInvitationResponse(invitationId, response),
              onDeleteTransaction: (transaction) => void handleDeleteTransaction(transaction),
              onRestoreTransaction: (transaction) => void handleRestoreTransaction(transaction),
              onExportData: () => void handleExportData(),
              onDeleteAccount: handleDeleteAccount,
              onDeletionConfirmationChange: setDeletionConfirmation,
              onDeletionPasswordChange: setDeletionPassword,
              onFormChange: setSettingsForm,
              onPromptClick: (idea) => {
                setText(idea);
                setInputMode("Text");
              },
              onSaveSettings: handleSaveSettings,
              onSaveTransaction: handleSaveTransaction,
              onSelectTransaction: selectTransaction,
              onSelectedHouseholdChange: setSelectedHouseholdId,
              onSubmit: handleSubmit,
              onTextChange: (value) => {
                setText(value);
                setInputMode("Text");
              },
              onToggleVoice: toggleVoiceInput,
              onTransactionMonthChange: (month) => void changeTransactionMonth(month),
              onTransactionPageChange: (page) => void changeTransactionPage(page),
              selectedHouseholdId,
              selectedTransaction,
              settingsForm,
              text,
              transactionMonth,
              transactionPage,
              transactions,
              householdName,
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
            <HouseholdScopeSelector
              households={households}
              onChange={(householdId) => {
                closeTransactionEditor();
                setSelectedHouseholdId(householdId);
              }}
              selectedHouseholdId={selectedHouseholdId}
            />
            <WorkspaceError error={error} isLoading={isLoadingData} />
            {renderSection(mobileSection, {
              accessToken: session.accessToken,
              allowHouseholdReportScope: selectedHousehold?.kind === "Family",
              chatEndRef,
              dashboard,
              dashboardMonth,
              categoryCatalog,
              goals,
              commitments,
              editForm,
              canWriteSelectedHousehold,
              deletedTransactions,
              deletionConfirmation,
              deletionPassword,
              households,
              householdInvitations,
              sentHouseholdInvitations,
              householdNotice,
              inputMode,
              isListening,
              isLoadingDashboard,
              isLoadingTransactions,
              isSavingHousehold,
              isSavingSettings,
              isSavingTransaction,
              isPrivacyWorking,
              isSubmitting,
              memberEmail,
              memberRole,
              messages,
              onAddMember: handleAddMember,
              onDashboardMonthChange: (month) => void changeDashboardMonth(month),
              onCloseEdit: closeTransactionEditor,
              onCreateHousehold: handleCreateHousehold,
              onSaveHouseholdSettings: handleSaveHouseholdSettings,
              onEditFormChange: setEditForm,
              onHouseholdNameChange: setHouseholdName,
              onMemberEmailChange: setMemberEmail,
              onMemberRoleChange: setMemberRole,
              onInvitationResponse: (invitationId, response) =>
                void handleInvitationResponse(invitationId, response),
              onDeleteTransaction: (transaction) => void handleDeleteTransaction(transaction),
              onRestoreTransaction: (transaction) => void handleRestoreTransaction(transaction),
              onExportData: () => void handleExportData(),
              onDeleteAccount: handleDeleteAccount,
              onDeletionConfirmationChange: setDeletionConfirmation,
              onDeletionPasswordChange: setDeletionPassword,
              onFormChange: setSettingsForm,
              onPromptClick: (idea) => {
                setText(idea);
                setInputMode("Text");
              },
              onSaveSettings: handleSaveSettings,
              onSaveTransaction: handleSaveTransaction,
              onSelectTransaction: selectTransaction,
              onSelectedHouseholdChange: setSelectedHouseholdId,
              onSubmit: handleSubmit,
              onTextChange: (value) => {
                setText(value);
                setInputMode("Text");
              },
              onToggleVoice: toggleVoiceInput,
              onTransactionMonthChange: (month) => void changeTransactionMonth(month),
              onTransactionPageChange: (page) => void changeTransactionPage(page),
              selectedHouseholdId,
              selectedTransaction,
              settingsForm,
              text,
              transactionMonth,
              transactionPage,
              transactions,
              householdName,
            })}
          </div>
        </section>
      </div>

      <MobileMenu
        activeSection={mobileSection}
        onClose={() => setMobileMenuOpen(false)}
        onSelectSection={selectSection}
        onSignOut={signOut}
        open={mobileMenuOpen}
        sessionEmail={session.user.email}
        sessionName={session.user.displayName}
      />

      {undoTransaction ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white shadow-xl" role="status">
          Moved to Recently Deleted.
          <button className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 font-bold" onClick={() => void handleRestoreTransaction(undoTransaction)} type="button">
            <RotateCcw className="h-4 w-4" /> Undo
          </button>
          <button aria-label="Dismiss undo" onClick={() => setUndoTransaction(null)} type="button"><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {desktopSection !== "assistant" ? (
        <DesktopAssistantDock
          chatEndRef={chatEndRef}
          inputMode={inputMode}
          isListening={isListening}
          isOpen={desktopAssistantOpen}
          isSubmitting={isSubmitting}
          messages={messages}
          onClose={() => setDesktopAssistantOpen(false)}
          onOpen={() => setDesktopAssistantOpen(true)}
          onSubmit={handleSubmit}
          onTextChange={(value) => {
            setText(value);
            setInputMode("Text");
          }}
          onToggleVoice={toggleVoiceInput}
          text={text}
        />
      ) : null}

      {selectedTransaction && editForm ? (
        <TransactionEditModal
          editForm={editForm}
          isSaving={isSavingTransaction}
          onClose={closeTransactionEditor}
          onEditFormChange={setEditForm}
          onSave={handleSaveTransaction}
          transaction={selectedTransaction}
        />
      ) : null}
    </main>
  );
}

type SectionRenderProps = {
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

function renderSection(section: Exclude<AppSection, "home">, props: SectionRenderProps) {
  if (section === "dashboard") {
    return (
      <DashboardSection
        dashboard={props.dashboard}
        isLoading={props.isLoadingDashboard}
        month={props.dashboardMonth}
        onMonthChange={props.onDashboardMonthChange}
      />
    );
  }

  if (section === "assistant") {
    return (
      <AssistantSection
        chatEndRef={props.chatEndRef}
        inputMode={props.inputMode}
        isListening={props.isListening}
        isSubmitting={props.isSubmitting}
        messages={props.messages}
        onPromptClick={props.onPromptClick}
        onSubmit={props.onSubmit}
        onTextChange={props.onTextChange}
        onToggleVoice={props.onToggleVoice}
        text={props.text}
        transactions={props.transactions}
      />
    );
  }

  if (section === "transactions") {
    return (
      <TransactionsSection
        canWrite={props.canWriteSelectedHousehold}
        deletedTransactions={props.deletedTransactions}
        isLoading={props.isLoadingTransactions}
        month={props.transactionMonth}
        onDeleteTransaction={props.onDeleteTransaction}
        onSelectTransaction={props.onSelectTransaction}
        onMonthChange={props.onTransactionMonthChange}
        onPageChange={props.onTransactionPageChange}
        onRestoreTransaction={props.onRestoreTransaction}
        page={props.transactionPage}
        transactions={props.transactions}
      />
    );
  }

  if (section === "reports") {
    return (
      <JudgementReportsPanel
        accessToken={props.accessToken}
        allowHouseholdScope={props.allowHouseholdReportScope}
        householdId={props.selectedHouseholdId}
      />
    );
  }

  if (section === "planning") {
    return (
      <PlanningSection
        canWrite={props.canWriteSelectedHousehold}
        categoryCatalog={props.categoryCatalog}
        commitments={props.commitments}
        currencyCode={props.dashboard?.currencyCode ?? "INR"}
        goals={props.goals}
        householdId={props.selectedHouseholdId}
        judgements={props.dashboard?.judgements ?? []}
      />
    );
  }

  if (section === "household") {
    return (
      <HouseholdSection
        householdName={props.householdName}
        households={props.households}
        invitations={props.householdInvitations}
        sentInvitations={props.sentHouseholdInvitations}
        isSaving={props.isSavingHousehold || props.isSavingSettings}
        memberEmail={props.memberEmail}
        memberRole={props.memberRole}
        onAddMember={props.onAddMember}
        onCreateHousehold={props.onCreateHousehold}
        onSaveHouseholdSettings={props.onSaveHouseholdSettings}
        onHouseholdNameChange={props.onHouseholdNameChange}
        onInvitationResponse={props.onInvitationResponse}
        onMemberEmailChange={props.onMemberEmailChange}
        onMemberRoleChange={props.onMemberRoleChange}
        onSelectedHouseholdChange={props.onSelectedHouseholdChange}
        selectedHouseholdId={props.selectedHouseholdId}
        statusMessage={props.householdNotice}
      />
    );
  }

  return (
    <SettingsSection
      deletionConfirmation={props.deletionConfirmation}
      deletionPassword={props.deletionPassword}
      form={props.settingsForm}
      isPrivacyWorking={props.isPrivacyWorking}
      isSaving={props.isSavingSettings}
      onDeleteAccount={props.onDeleteAccount}
      onDeletionConfirmationChange={props.onDeletionConfirmationChange}
      onDeletionPasswordChange={props.onDeletionPasswordChange}
      onExportData={props.onExportData}
      onFormChange={props.onFormChange}
      onSave={props.onSaveSettings}
    />
  );
}

function DesktopSidebar({
  activeSection,
  currencyCode,
  income,
  onSelectSection,
  onSignOut,
  plan,
  saved,
  sessionEmail,
  sessionName,
  spends,
}: {
  activeSection: Exclude<AppSection, "home">;
  currencyCode: string;
  income: number;
  onSelectSection: (section: Exclude<AppSection, "home">) => void;
  onSignOut: () => void;
  plan: UserPlan;
  saved: number;
  sessionEmail: string;
  sessionName: string;
  spends: number;
}) {
  return (
    <aside className="hidden w-[272px] shrink-0 border-r border-white/10 bg-[var(--sidebar)] px-5 py-6 text-white lg:flex lg:min-h-0 lg:flex-col">
      <Link className="flex items-center gap-3" href="/">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[var(--sidebar)]">
          <BrandMarkIcon className="h-6 w-6" />
        </span>
        <span className="text-lg font-semibold">MoneyMentor</span>
      </Link>

      <nav className="mt-9 space-y-1" aria-label="Desktop navigation">
        {navItems.map((item) => (
          <SidebarButton
            active={activeSection === item.section}
            icon={item.icon}
            key={item.section}
            label={item.label}
            onClick={() => onSelectSection(item.section)}
          />
        ))}
      </nav>

      <div className="mt-8 rounded-lg border border-white/12 bg-white/[0.06] p-4">
        <p className="text-xs font-semibold uppercase text-white/50">This month</p>
        <div className="mt-4 space-y-3">
          <SidebarStat label="Income" value={formatMoney(income, currencyCode)} />
          <SidebarStat label="Spends" value={formatMoney(spends, currencyCode)} />
          <SidebarStat label="Saved" value={formatMoney(saved, currencyCode)} />
          <SidebarStat label="Plan" value={plan} />
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-white/12 bg-white/[0.06] p-4">
        <p className="text-sm font-semibold">{sessionName}</p>
        <p className="mt-1 break-words text-xs font-medium text-white/54">{sessionEmail}</p>
        <button
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-[var(--sidebar)] transition hover:bg-[var(--mint)]"
          onClick={onSignOut}
          type="button"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
        active ? "bg-white text-[var(--sidebar)]" : "text-white/72 hover:bg-white/10 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

function MobileHeader({
  activeSection,
  greetingName,
  onMenuOpen,
}: {
  activeSection: Exclude<AppSection, "home">;
  greetingName: string;
  onMenuOpen: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-white/88 px-4 backdrop-blur lg:hidden">
      <button
        aria-label="Open menu"
        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-white text-[var(--ink)]"
        onClick={onMenuOpen}
        type="button"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 text-center">
        <p className="text-xs font-semibold text-[var(--muted)]">Welcome, {greetingName}</p>
        <h1 className="truncate text-lg font-semibold tracking-normal">{sectionLabel(activeSection)}</h1>
      </div>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
        <BrandMarkIcon className="h-6 w-6" />
      </span>
    </header>
  );
}

function MobileMenu({
  activeSection,
  onClose,
  onSelectSection,
  onSignOut,
  open,
  sessionEmail,
  sessionName,
}: {
  activeSection: Exclude<AppSection, "home">;
  onClose: () => void;
  onSelectSection: (section: Exclude<AppSection, "home">) => void;
  onSignOut: () => void;
  open: boolean;
  sessionEmail: string;
  sessionName: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/28 lg:hidden" role="presentation">
      <aside
        aria-label="Mobile menu"
        className="flex h-full w-[min(84vw,340px)] flex-col bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <BrandMarkIcon className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold">MoneyMentor</span>
          </div>
          <button
            aria-label="Close menu"
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-8 space-y-2" aria-label="Mobile navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                className={`flex h-12 w-full items-center gap-3 rounded-lg border px-3 text-sm font-bold transition ${
                  activeSection === item.section
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-white text-[var(--ink)]"
                }`}
                key={item.section}
                onClick={() => onSelectSection(item.section)}
                type="button"
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold">{sessionName}</p>
          <p className="mt-1 break-words text-xs font-medium text-[var(--muted)]">{sessionEmail}</p>
          <button
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-sm font-bold text-white"
            onClick={onSignOut}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceError({ error, isLoading }: { error: string | null; isLoading: boolean }) {
  if (error) {
    return (
      <p className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
        {error}
      </p>
    );
  }

  if (!isLoading) {
    return null;
  }

  return (
    <p className="mb-4 rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">
      Syncing your MoneyMentor workspace...
    </p>
  );
}

function DashboardSection({
  dashboard,
  isLoading,
  month,
  onMonthChange,
}: {
  dashboard: MonthlyDashboardResponse | null;
  isLoading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  if (!dashboard) {
    return <EmptyState icon={BarChart3} title="Loading dashboard" text="Your real money snapshot is being synced." />;
  }

  return (
    <section
      aria-busy={isLoading}
      className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">{dashboard.monthLabel}</p>
          <h2 className="text-3xl font-semibold tracking-normal">Dashboard</h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Based on your stored MoneyMentor transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MonthNavigator
            disabled={isLoading}
            label="Dashboard month"
            month={month}
            onMonthChange={onMonthChange}
          />
          <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
            <CheckCircle2 className="h-4 w-4" />
            Backend data
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label="Income" value={formatMoney(dashboard.income, dashboard.currencyCode)} detail="Tracked income" tone="income" />
        <MetricCard icon={ReceiptText} label="Spends" value={formatMoney(dashboard.spends, dashboard.currencyCode)} detail="Tracked expenses" tone="spend" />
        <MetricCard icon={Wallet} label="Saved" value={formatMoney(dashboard.saved, dashboard.currencyCode)} detail={dashboard.savingsRate === null ? "Income not tracked" : `${dashboard.savingsRate}% savings rate`} tone="saved" />
        <MetricCard icon={BarChart3} label="Categories" value={dashboard.categories.length.toString()} detail="With deterministic judgements" tone="neutral" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Category spending</h3>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">Calculated from stored expenses.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.categories.length > 0 ? (
              dashboard.categories.map((category) => (
                <CategoryRow category={category} currencyCode={dashboard.currencyCode} key={category.name} total={dashboard.spends} />
              ))
            ) : (
              <EmptyInline text="No expenses are tracked for this month yet." />
            )}
          </div>
        </article>

        <div className="grid gap-5">
          <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">Judgements</h3>
            <div className="mt-4 grid gap-3">
              {dashboard.judgements.map((judgement) => (
                <JudgementCard judgement={judgement} key={`${judgement.title}-${judgement.value}`} />
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">Insights</h3>
            <div className="mt-4 grid gap-3">
              {dashboard.insights.map((insight) => (
                <InsightCard insight={insight} key={insight.title} />
              ))}
            </div>
          </article>
        </div>
      </div>

      <TransactionsPanel transactions={dashboard.recentTransactions} />
    </section>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof Bot;
  label: string;
  tone: "income" | "spend" | "saved" | "neutral";
  value: string;
}) {
  const toneClassName = {
    income: "bg-emerald-50 text-emerald-700",
    neutral: "bg-slate-100 text-slate-700",
    saved: "bg-[var(--accent-soft)] text-[var(--accent)]",
    spend: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${toneClassName}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</span>
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-sm font-medium text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function CategoryRow({
  category,
  currencyCode,
  total,
}: {
  category: CategorySpendSummary;
  currencyCode: string;
  total: number;
}) {
  const percent = total > 0 ? Math.round((category.amount / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{category.name}</p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">{category.note}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">{formatMoney(category.amount, currencyCode)}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{percent}%</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function JudgementCard({ judgement }: { judgement: DashboardJudgement }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-md px-2 py-1 text-xs font-bold ${toneClass(judgement.tone)}`}>
          {formatTone(judgement.tone)}
        </span>
        <span className="text-sm font-bold">{judgement.value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{judgement.title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted)]">{judgement.text}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: DashboardInsight }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm font-semibold">{insight.title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted)]">{insight.text}</p>
    </div>
  );
}

function TransactionsPanel({ transactions }: { transactions: TransactionListItem[] }) {
  return (
    <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Recent transactions</h3>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">Latest visible records from the backend.</p>
        </div>
        <ReceiptText className="h-5 w-5 text-[var(--accent)]" />
      </div>
      <div className="mt-4 divide-y divide-[var(--border)]">
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <EmptyInline text="No transactions yet. Try tracking an expense or income in the assistant." />
        )}
      </div>
    </article>
  );
}

function AssistantSection({
  chatEndRef,
  inputMode,
  isListening,
  isSubmitting,
  messages,
  onPromptClick,
  onSubmit,
  onTextChange,
  onToggleVoice,
  text,
  transactions,
}: {
  chatEndRef: RefObject<HTMLDivElement | null>;
  inputMode: InputMode;
  isListening: boolean;
  isSubmitting: boolean;
  messages: Message[];
  onPromptClick: (idea: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  text: string;
  transactions: TransactionListItem[];
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <ChatSurface
        chatEndRef={chatEndRef}
        inputMode={inputMode}
        isListening={isListening}
        isSubmitting={isSubmitting}
        messages={messages}
        onPromptClick={onPromptClick}
        onSubmit={onSubmit}
        onTextChange={onTextChange}
        onToggleVoice={onToggleVoice}
        showPromptIdeas
        text={text}
        title="What did you spend or receive?"
      />
      <div className="hidden min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm lg:block">
        <h3 className="text-base font-semibold">Recent tracked</h3>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {transactions.slice(0, 5).map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} compact />
          ))}
          {transactions.length === 0 ? <EmptyInline text="Tracked expenses and income will appear here." /> : null}
        </div>
      </div>
    </section>
  );
}

function ChatSurface({
  chatEndRef,
  compact = false,
  inputMode,
  isListening,
  isSubmitting,
  messages,
  onPromptClick,
  onSubmit,
  onTextChange,
  onToggleVoice,
  showPromptIdeas,
  text,
  title,
}: {
  chatEndRef: RefObject<HTMLDivElement | null>;
  compact?: boolean;
  inputMode: InputMode;
  isListening: boolean;
  isSubmitting: boolean;
  messages: Message[];
  onPromptClick?: (idea: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  showPromptIdeas?: boolean;
  text: string;
  title: string;
}) {
  return (
    <div className={`chat-panel flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "rounded-lg" : ""}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-white/78 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          <p className="text-sm font-medium text-[var(--muted)]">
            {compact ? "Ask, track, or clarify." : "Type or speak naturally."}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
          <Bot className="h-4 w-4" />
          {inputMode}
        </span>
      </div>

      <div className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-5">
        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} />
        ))}
        {isSubmitting ? <TypingBubble /> : null}
        <div ref={chatEndRef} />
      </div>

      {isListening ? <VoiceWavePanel /> : null}

      <div className="shrink-0 border-t border-[var(--border)] bg-white/90 p-3 backdrop-blur">
        {showPromptIdeas && onPromptClick ? (
          <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
            {promptIdeas.map((idea) => (
              <button
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--ink)]"
                key={idea}
                onClick={() => onPromptClick(idea)}
                type="button"
              >
                {idea}
              </button>
            ))}
          </div>
        ) : null}

        <form className="flex items-end gap-2" onSubmit={onSubmit}>
          <div className="chat-text-bar flex min-h-14 flex-1 items-end gap-2 rounded-full border border-[var(--border)] bg-white px-2 py-2 shadow-inner transition">
            <textarea
              aria-label="Message MoneyMentor"
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base font-medium leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-2)]"
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="spent 500 on groceries or got salary 50000"
              rows={1}
              value={text}
            />
            <VoiceAiButton
              disabled={isSubmitting}
              isListening={isListening}
              onClick={onToggleVoice}
            />
          </div>

          <button
            aria-label={isSubmitting ? "Sending message" : "Send message"}
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_30px_rgba(15,143,123,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0b7d6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSubmitting}
            type="submit"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

function DesktopAssistantDock({
  chatEndRef,
  inputMode,
  isListening,
  isOpen,
  isSubmitting,
  messages,
  onClose,
  onOpen,
  onSubmit,
  onTextChange,
  onToggleVoice,
  text,
}: {
  chatEndRef: RefObject<HTMLDivElement | null>;
  inputMode: InputMode;
  isListening: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  messages: Message[];
  onClose: () => void;
  onOpen: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  text: string;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
      {isOpen ? (
        <section
          aria-label="Assistant chat"
          className="mb-4 flex h-[560px] w-[420px] min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_28px_90px_rgba(16,43,38,0.22)]"
          role="dialog"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--ink)] text-white">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Assistant</p>
                <p className="text-xs font-medium text-[var(--muted)]">Floating workspace</p>
              </div>
            </div>
            <button
              aria-label="Close assistant chat"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatSurface
            chatEndRef={chatEndRef}
            compact
            inputMode={inputMode}
            isListening={isListening}
            isSubmitting={isSubmitting}
            messages={messages}
            onSubmit={onSubmit}
            onTextChange={onTextChange}
            onToggleVoice={onToggleVoice}
            text={text}
            title="What did you spend or receive?"
          />
        </section>
      ) : null}

      <button
        aria-label="Open assistant chat"
        className="ai-voice-button grid h-16 w-16 place-items-center rounded-full text-[var(--accent)] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        onClick={isOpen ? onClose : onOpen}
        type="button"
      >
        <Bot className="h-7 w-7" />
      </button>
    </div>
  );
}

function TransactionsSection({
  canWrite,
  deletedTransactions,
  isLoading,
  month,
  onDeleteTransaction,
  onMonthChange,
  onPageChange,
  onSelectTransaction,
  onRestoreTransaction,
  page,
  transactions,
}: {
  canWrite: boolean;
  deletedTransactions: TransactionListItem[];
  isLoading: boolean;
  month: string;
  onDeleteTransaction: (transaction: TransactionListItem) => void;
  onMonthChange: (month: string) => void;
  onPageChange: (page: number) => void;
  onSelectTransaction: (transaction: TransactionListItem) => void;
  onRestoreTransaction: (transaction: TransactionListItem) => void;
  page: TransactionPageResponse | null;
  transactions: TransactionListItem[];
}) {
  const currentPage = page?.page ?? 1;
  const totalPages = Math.max(page?.totalPages ?? 0, 1);

  return (
    <section
      aria-busy={isLoading}
      className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0"
    >
      <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal">Transactions</h2>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">
              Review one month at a time and edit a record when you need to.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonthNavigator
              disabled={isLoading}
              label="Transaction month"
              month={month}
              onMonthChange={onMonthChange}
            />
            <ReceiptText className="h-5 w-5 text-[var(--accent)]" />
          </div>
        </div>

        <div className={`mt-5 divide-y divide-[var(--border)] ${isLoading ? "opacity-60" : ""}`}>
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <TransactionRow
                canWrite={canWrite}
                key={transaction.id}
                onDelete={() => onDeleteTransaction(transaction)}
                onEdit={() => onSelectTransaction(transaction)}
                transaction={transaction}
              />
            ))
          ) : (
            <EmptyInline text={`No transactions found in ${formatMonthKey(month)}.`} />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <p className="text-sm font-medium text-[var(--muted)]" aria-live="polite">
            {page?.totalCount ?? 0} records, Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous transaction page"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isLoading || currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              aria-label="Next transaction page"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isLoading || currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              type="button"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </article>

      <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Recently deleted</h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">Items remain restorable for 30 days.</p>
          </div>
          <Trash2 className="h-5 w-5 text-[var(--muted)]" />
        </div>
        <div className="mt-4 divide-y divide-[var(--border)]">
          {deletedTransactions.length > 0 ? deletedTransactions.map((transaction) => (
            <div className="flex items-center justify-between gap-3 py-3" key={transaction.id}>
              <div>
                <p className="text-sm font-semibold">{transaction.reason ?? transaction.description ?? transaction.categoryName ?? "Transaction"}</p>
                <p className="text-xs font-medium text-[var(--muted)]">{formatMoney(transaction.amount, transaction.currencyCode)} · purge {transaction.purgeAfter ? formatDate(transaction.purgeAfter) : "in 30 days"}</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-45" disabled={!canWrite} onClick={() => onRestoreTransaction(transaction)} type="button">
                <RotateCcw className="h-4 w-4" /> Restore
              </button>
            </div>
          )) : <EmptyInline text="Trash is empty." />}
        </div>
      </article>

    </section>
  );
}

function PlanningSection({
  canWrite,
  categoryCatalog,
  commitments,
  currencyCode,
  goals,
  householdId,
  judgements,
}: {
  canWrite: boolean;
  categoryCatalog: CategoryCatalogResponse | null;
  commitments: Commitment[];
  currencyCode: string;
  goals: Goal[];
  householdId: string | null;
  judgements: DashboardJudgement[];
}) {
  const [createdGoals, setCreatedGoals] = useState<Goal[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goals[0]?.id ?? null);
  const [goalDetail, setGoalDetail] = useState<GoalDetail | null>(null);
  const [planningRun, setPlanningRun] = useState<GoalPlanningRun | null>(null);
  const [isPlanningWorking, setIsPlanningWorking] = useState(false);
  const [planningNotice, setPlanningNotice] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState({
    name: "",
    goalType: "Saving" as Goal["goalType"],
    targetAmount: "",
    targetDate: "",
    priority: "Medium" as Goal["priority"],
    isShared: false,
  });
  const [planForm, setPlanForm] = useState({
    pace: "" as "" | GoalPlanPace,
    targetDate: "",
    monthlyContribution: "",
  });
  const [customizationContext, setCustomizationContext] = useState("");

  const visibleGoals = useMemo(
    () => [...createdGoals, ...goals.filter((goal) => !createdGoals.some((created) => created.id === goal.id))],
    [createdGoals, goals],
  );

  const accessToken = getAuthSessionSnapshot()?.accessToken;

  const loadGoalDetail = useCallback(async (goalId: string) => {
    if (!accessToken) return;
    const detail = await getGoal(accessToken, goalId);
    setGoalDetail(detail);
    setSelectedGoalId(goalId);
  }, [accessToken]);

  useEffect(() => {
    if (!planningRun || !accessToken || !["Pending", "Processing"].includes(planningRun.status)) {
      return;
    }
    const timer = window.setTimeout(() => {
      void getGoalPlanningRun(accessToken, planningRun.goalId, planningRun.id)
        .then(async (nextRun) => {
          setPlanningRun(nextRun);
          if (nextRun.status === "Succeeded") {
            await loadGoalDetail(nextRun.goalId);
            setPlanningNotice("Your plan is ready.");
          } else if (nextRun.status === "Failed") {
            setPlanningNotice(nextRun.error ?? "Plan generation failed. You can retry.");
          }
        })
        .catch(() => setPlanningNotice("Could not refresh plan generation status."));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [accessToken, loadGoalDetail, planningRun]);

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !goalForm.name.trim() || !goalForm.targetAmount) return;
    setIsPlanningWorking(true);
    setPlanningNotice(null);
    try {
      const created = await createGoal(accessToken, {
        householdId: householdId ?? undefined,
        name: goalForm.name.trim(),
        goalType: goalForm.goalType,
        targetAmount: Number(goalForm.targetAmount),
        targetDate: goalForm.targetDate || undefined,
        priority: goalForm.priority,
        isShared: goalForm.isShared,
      });
      setCreatedGoals((current) => [created, ...current]);
      setGoalForm({
        name: "",
        goalType: "Saving",
        targetAmount: "",
        targetDate: "",
        priority: "Medium",
        isShared: false,
      });
      await loadGoalDetail(created.id);
      setPlanningNotice("Goal created. Generate a plan when you are ready.");
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not create goal.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleGeneratePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    setPlanningNotice(null);
    try {
      const run = await createGoalPlanningRun(accessToken, selectedGoalId, {
        pace: planForm.pace || undefined,
        targetDate: planForm.targetDate || undefined,
        monthlyContribution: planForm.monthlyContribution
          ? Number(planForm.monthlyContribution)
          : undefined,
        locale: "en-IN",
      });
      setPlanningRun(run);
      setPlanningNotice("We are securely preparing your plan in the background.");
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not start planning.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleActivate(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    try {
      await activateGoalPlan(accessToken, selectedGoalId, version.id);
      await loadGoalDetail(selectedGoalId);
      setPlanningNotice("You are now following this plan.");
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not follow this plan.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleCustomize(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    const source = version.options[0];
    if (!source) return;
    setIsPlanningWorking(true);
    try {
      const customized = await customizeGoalPlan(accessToken, selectedGoalId, version.id, {
        pace: planForm.pace || source.pace,
        targetDate: planForm.targetDate || undefined,
        monthlyContribution: planForm.monthlyContribution
          ? Number(planForm.monthlyContribution)
          : source.monthlyContribution,
        context: customizationContext || undefined,
      });
      await loadGoalDetail(selectedGoalId);
      setPlanningNotice(`Customized version ${customized.versionNumber} created.`);
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not customize plan.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleReview(version: GoalPlanVersion) {
    if (!accessToken || !selectedGoalId) return;
    setIsPlanningWorking(true);
    try {
      const run = await reviewGoalPlan(accessToken, selectedGoalId, version.id);
      setPlanningRun(run);
      setPlanningNotice("AI review started.");
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not start AI review.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  async function handleConsent() {
    if (!accessToken || !selectedGoalId || !goalDetail) return;
    setIsPlanningWorking(true);
    try {
      if (goalDetail.currentUserConsent?.revokedAt === null) {
        await deleteGoalParticipantConsent(accessToken, selectedGoalId);
      } else {
        await putGoalParticipantConsent(accessToken, selectedGoalId);
      }
      await loadGoalDetail(selectedGoalId);
    } catch (caughtError) {
      setPlanningNotice(caughtError instanceof Error ? caughtError.message : "Could not update consent.");
    } finally {
      setIsPlanningWorking(false);
    }
  }

  const visibleGroups = useMemo(() => {
    const categoryById = new Map((categoryCatalog?.categories ?? []).map((category) => [category.id, category]));
    return (categoryCatalog?.categories ?? [])
      .filter((category) => category.parentCategoryId === null && !category.isHidden)
      .map((group) => ({
        ...group,
        childCount: (categoryCatalog?.categories ?? []).filter(
          (category) => category.parentCategoryId === group.id && !category.isHidden,
        ).length,
      }))
      .filter((group) => group.childCount > 0 || categoryById.has(group.id))
      .slice(0, 8);
  }, [categoryCatalog]);

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Planning</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Goals, SIPs, premiums, and rule-based nudges in one place.
              </p>
            </div>
            <Flag className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PlanningStat label="Active goals" value={visibleGoals.filter((goal) => goal.status === "Active").length.toString()} />
            <PlanningStat label="Commitments" value={commitments.filter((commitment) => commitment.isActive).length.toString()} />
            <PlanningStat label="Judgements" value={judgements.length.toString()} />
          </div>

          {!canWrite ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              This household is read-only for you. Planning data is visible, but changes are disabled.
            </p>
          ) : null}

          {canWrite ? (
            <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateGoal}>
              <label className="text-xs font-bold text-[var(--muted)]">
                Goal
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  maxLength={128}
                  onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Emergency fund"
                  required
                  value={goalForm.name}
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Target amount
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  min="0.01"
                  onChange={(event) => setGoalForm((current) => ({ ...current, targetAmount: event.target.value }))}
                  required
                  step="0.01"
                  type="number"
                  value={goalForm.targetAmount}
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Goal type
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  onChange={(event) => setGoalForm((current) => ({
                    ...current,
                    goalType: event.target.value as Goal["goalType"],
                  }))}
                  value={goalForm.goalType}
                >
                  <option value="Saving">Saving</option>
                  <option value="EmergencyFund">Emergency fund</option>
                  <option value="DebtPayoff">Debt payoff</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Investment">Investment</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Target date (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  onChange={(event) => setGoalForm((current) => ({ ...current, targetDate: event.target.value }))}
                  type="date"
                  value={goalForm.targetDate}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  checked={goalForm.isShared}
                  onChange={(event) => setGoalForm((current) => ({ ...current, isShared: event.target.checked }))}
                  type="checkbox"
                />
                Share with household
              </label>
              <button
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={isPlanningWorking}
                type="submit"
              >
                Create goal
              </button>
            </form>
          ) : null}
          {planningNotice ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700" role="status">
              {planningNotice}
            </p>
          ) : null}
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Current nudges</h3>
          <div className="mt-4 space-y-3">
            {judgements.length > 0 ? (
              judgements.slice(0, 4).map((judgement) => (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3" key={judgement.id ?? judgement.title}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">{judgement.title}</p>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[var(--muted)]">{judgement.severity ?? judgement.tone}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{judgement.text}</p>
                </div>
              ))
            ) : (
              <EmptyInline text="No planning nudges for this month yet." />
            )}
          </div>
        </article>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Goals</h3>
          <div className="mt-4 space-y-3">
            {visibleGoals.length > 0 ? (
              visibleGoals.slice(0, 8).map((goal) => (
                <button
                  className={`w-full rounded-lg border p-3 text-left ${selectedGoalId === goal.id ? "border-[var(--accent)] bg-emerald-50/40" : "border-[var(--border)]"}`}
                  key={goal.id}
                  onClick={() => void loadGoalDetail(goal.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{goal.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{goal.goalType} - {goal.priority} priority - {goal.status}</p>
                    </div>
                    <span className="text-sm font-bold">{formatMoney(goal.currentAmount, currencyCode)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.min(100, Math.round((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium text-[var(--muted)]">
                    {formatMoney(goal.remainingAmount, currencyCode)} left
                    {goal.requiredMonthlyContribution ? ` - needs ${formatMoney(goal.requiredMonthlyContribution, currencyCode)}/mo` : ""}
                  </p>
                </button>
              ))
            ) : (
              <EmptyInline text="No goals yet. Create your first goal above." />
            )}
          </div>
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Commitments</h3>
          <div className="mt-4 space-y-3">
            {commitments.length > 0 ? (
              commitments.slice(0, 6).map((commitment) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3" key={commitment.id}>
                  <div>
                    <p className="text-sm font-bold">{commitment.name}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                      {commitment.transactionType} - {commitment.cadence} - due {formatDate(commitment.nextDueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatMoney(commitment.amount, currencyCode)}</p>
                    <p className={`text-xs font-bold ${commitment.isActive ? "text-emerald-600" : "text-slate-500"}`}>
                      {commitment.isActive ? "Active" : "Paused"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyInline text="No recurring commitments tracked yet." />
            )}
          </div>
        </article>
      </div>

      <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">AI goal planner</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Based on calculated aggregates from your tracked finances. AI explains the plan; MoneyMentor calculates the amounts.
            </p>
          </div>
          {planningRun ? (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
              {planningRun.runType} · {planningRun.status}
            </span>
          ) : null}
        </div>

        {!goalDetail ? (
          <div className="mt-4"><EmptyInline text="Select a goal to generate or review a plan." /></div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface)] p-3">
              <div>
                <p className="text-sm font-bold">{goalDetail.goal.name}</p>
                <p className="text-xs font-semibold text-[var(--muted)]">
                  {formatMoney(goalDetail.goal.remainingAmount, currencyCode)} remaining
                  {goalDetail.plan?.activeVersionId ? " · following a plan" : " · no followed plan"}
                </p>
              </div>
              {goalDetail.goal.userProfileId === null ? (
                <button
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-bold disabled:opacity-50"
                  disabled={isPlanningWorking}
                  onClick={() => void handleConsent()}
                  type="button"
                >
                  {goalDetail.currentUserConsent?.revokedAt === null
                    ? "Revoke private aggregate consent"
                    : "Opt in private aggregates"}
                </button>
              ) : null}
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleGeneratePlan}>
              <label className="text-xs font-bold text-[var(--muted)]">
                Pace (optional)
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  onChange={(event) => setPlanForm((current) => ({
                    ...current,
                    pace: event.target.value as "" | GoalPlanPace,
                  }))}
                  value={planForm.pace}
                >
                  <option value="">Show three paces</option>
                  <option value="Comfortable">Comfortable</option>
                  <option value="Balanced">Balanced</option>
                  <option value="Aggressive">Aggressive</option>
                </select>
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Target date (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  onChange={(event) => setPlanForm((current) => ({ ...current, targetDate: event.target.value }))}
                  type="date"
                  value={planForm.targetDate}
                />
              </label>
              <label className="text-xs font-bold text-[var(--muted)]">
                Monthly amount (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)]"
                  min="0.01"
                  onChange={(event) => setPlanForm((current) => ({ ...current, monthlyContribution: event.target.value }))}
                  step="0.01"
                  type="number"
                  value={planForm.monthlyContribution}
                />
              </label>
              <button
                className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={!canWrite || isPlanningWorking || ["Pending", "Processing"].includes(planningRun?.status ?? "")}
                type="submit"
              >
                Generate plan
              </button>
            </form>

            {goalDetail.plan?.versions.length ? (
              <div className="mt-5 space-y-5">
                {goalDetail.plan.versions.map((version) => (
                  <section className="rounded-lg border border-[var(--border)] p-4" key={version.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold">
                        Version {version.versionNumber} · {version.source}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                          disabled={isPlanningWorking}
                          onClick={() => void handleReview(version)}
                          type="button"
                        >
                          Review with AI
                        </button>
                        <button
                          className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          disabled={isPlanningWorking || goalDetail.plan?.activeVersionId === version.id}
                          onClick={() => void handleActivate(version)}
                          type="button"
                        >
                          {goalDetail.plan?.activeVersionId === version.id ? "Following" : "Follow this version"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      {version.options.map((option) => (
                        <div className="rounded-lg bg-[var(--surface)] p-3" key={option.id}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold">{option.title}</p>
                            <span className="text-xs font-bold text-[var(--accent)]">{option.pace}</span>
                          </div>
                          <p className="mt-2 text-xl font-semibold">{formatMoney(option.monthlyContribution, currencyCode)}/mo</p>
                          <p className="text-xs font-semibold text-[var(--muted)]">
                            Target {formatDate(option.projectedCompletionDate)} · {option.feasibility}
                          </p>
                          <p className="mt-3 text-sm text-[var(--muted)]">{option.explanation}</p>
                          {option.risks.length ? (
                            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs font-medium text-amber-800">
                              {option.risks.map((risk) => <li key={risk}>{risk}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                      <textarea
                        aria-label="Plan customization context"
                        className="min-h-20 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                        maxLength={1000}
                        onChange={(event) => setCustomizationContext(event.target.value)}
                        placeholder="Optional context for a customized version, for example: keep more room for school fees."
                        value={customizationContext}
                      />
                      <button
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-bold disabled:opacity-50"
                        disabled={isPlanningWorking}
                        onClick={() => void handleCustomize(version)}
                        type="button"
                      >
                        Save customization
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-4"><EmptyInline text="No plan versions yet." /></div>
            )}
          </>
        )}
        <p className="mt-4 text-xs font-medium text-[var(--muted)]">
          Guidance is based on tracked data and is not a guarantee or certified financial advice. Review assumptions before following a plan.
        </p>
      </article>

      <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Category groups</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleGroups.length > 0 ? visibleGroups.map((group) => (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3" key={group.id}>
              <p className="text-sm font-bold">{group.name}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{group.classification} - {group.childCount} categories</p>
            </div>
          )) : <EmptyInline text="Categories will appear after the catalog is loaded." />}
        </div>
      </article>
    </section>
  );
}

function PlanningStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function HouseholdScopeSelector({
  households,
  onChange,
  selectedHouseholdId,
}: {
  households: HouseholdDashboard | null;
  onChange: (householdId: string) => void;
  selectedHouseholdId: string | null;
}) {
  if (!households || households.households.length === 0) return null;
  const selected = households.households.find((household) => household.id === selectedHouseholdId);
  return (
    <div className="mb-4 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white px-4 py-3 shadow-sm lg:mb-5">
      <label className="flex min-w-0 items-center gap-3 text-sm font-semibold">
        <Users className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="hidden sm:inline">Household</span>
        <select className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" onChange={(event) => onChange(event.target.value)} value={selectedHouseholdId ?? households.defaultHouseholdId}>
          {households.households.map((household) => (
            <option key={household.id} value={household.id}>{household.name} ({household.kind})</option>
          ))}
        </select>
      </label>
      <span className={`rounded-md px-2 py-1 text-xs font-bold ${selected?.canWrite ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {selected?.canWrite ? "Can write" : "Read only"}
      </span>
    </div>
  );
}

function MonthNavigator({
  disabled,
  label,
  month,
  onMonthChange,
}: {
  disabled: boolean;
  label: string;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const monthOptions = useMemo(() => getMonthOptions(month), [month]);
  const nextMonth = shiftMonthKey(month, 1);
  const currentMonth = getCurrentMonthKey();

  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white p-1 shadow-sm">
      <button
        aria-label={`Previous ${label.toLowerCase()}`}
        className="grid h-9 w-9 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-45"
        disabled={disabled}
        onClick={() => onMonthChange(shiftMonthKey(month, -1))}
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        aria-label={label}
        className="h-9 min-w-36 bg-transparent px-2 text-sm font-semibold outline-none disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onMonthChange(event.target.value)}
        value={month}
      >
        {monthOptions.map((option) => (
          <option key={option} value={option}>
            {formatMonthKey(option)}
          </option>
        ))}
      </select>
      <button
        aria-label={`Next ${label.toLowerCase()}`}
        className="grid h-9 w-9 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-45"
        disabled={disabled || nextMonth > currentMonth}
        onClick={() => onMonthChange(nextMonth)}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function TransactionEditModal({
  editForm,
  isSaving,
  onClose,
  onEditFormChange,
  onSave,
  transaction,
}: {
  editForm: TransactionEditForm;
  isSaving: boolean;
  onClose: () => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  transaction: TransactionListItem;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const isIncome = transaction.type === "Income";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      aria-describedby="transaction-editor-description"
      aria-labelledby="transaction-editor-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,560px)] overflow-hidden rounded-xl border border-[var(--border)] bg-white p-0 text-[var(--ink)] shadow-2xl backdrop:bg-slate-950/45"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      ref={dialogRef}
    >
      <form className="flex max-h-[90dvh] flex-col" onSubmit={onSave}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold" id="transaction-editor-title">Edit transaction</h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]" id="transaction-editor-description">
              Last edited by {transaction.updatedByDisplayName ?? "MoneyMentor"}
            </p>
          </div>
          <button
            aria-label="Close transaction editor"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Amount">
            <input
              className="form-control"
              min="0.01"
              onChange={(event) => onEditFormChange({ ...editForm, amount: event.target.value })}
              required
              step="0.01"
              type="number"
              value={editForm.amount}
            />
          </Field>
          <Field label="Category">
            <input
              className="form-control"
              onChange={(event) => onEditFormChange({ ...editForm, categoryName: event.target.value })}
              value={editForm.categoryName}
            />
          </Field>
          {isIncome ? (
            <>
              <Field label="Sender">
                <input
                  className="form-control"
                  onChange={(event) => onEditFormChange({ ...editForm, senderName: event.target.value })}
                  value={editForm.senderName}
                />
              </Field>
              <Field label="Reason">
                <input
                  className="form-control"
                  onChange={(event) => onEditFormChange({ ...editForm, reason: event.target.value })}
                  value={editForm.reason}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Merchant">
                <input
                  className="form-control"
                  onChange={(event) => onEditFormChange({ ...editForm, merchantName: event.target.value })}
                  value={editForm.merchantName}
                />
              </Field>
              <Field label="Description">
                <input
                  className="form-control"
                  onChange={(event) => onEditFormChange({ ...editForm, description: event.target.value })}
                  value={editForm.description}
                />
              </Field>
            </>
          )}
          <Field label="Transaction date">
            <input
              className="form-control"
              onChange={(event) => onEditFormChange({ ...editForm, transactionDate: event.target.value })}
              required
              type="date"
              value={editForm.transactionDate}
            />
          </Field>
          <Field label="Visibility">
            <select
              className="form-control"
              onChange={(event) =>
                onEditFormChange({
                  ...editForm,
                  visibility: event.target.value as TransactionVisibility,
                })
              }
              value={editForm.visibility}
            >
              <option value="Private">Private</option>
              <option value="Household">Household</option>
            </select>
          </Field>
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-white px-5 py-4">
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
                disabled={isSaving}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save transaction"}
              </button>
        </div>
      </form>
    </dialog>
  );
}

function HouseholdSection({
  householdName,
  households,
  invitations,
  sentInvitations,
  isSaving,
  memberEmail,
  memberRole,
  onAddMember,
  onCreateHousehold,
  onSaveHouseholdSettings,
  onHouseholdNameChange,
  onInvitationResponse,
  onMemberEmailChange,
  onMemberRoleChange,
  onSelectedHouseholdChange,
  selectedHouseholdId,
  statusMessage,
}: {
  householdName: string;
  households: HouseholdDashboard | null;
  invitations: HouseholdInvitation[];
  sentInvitations: HouseholdInvitation[];
  isSaving: boolean;
  memberEmail: string;
  memberRole: HouseholdRole;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHousehold: (event: FormEvent<HTMLFormElement>) => void;
  onSaveHouseholdSettings: (event: FormEvent<HTMLFormElement>) => void;
  onHouseholdNameChange: (value: string) => void;
  onInvitationResponse: (
    invitationId: string,
    response: "accept" | "decline",
  ) => void;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (role: HouseholdRole) => void;
  onSelectedHouseholdChange: (householdId: string) => void;
  selectedHouseholdId: string | null;
  statusMessage: string | null;
}) {
  if (!households) {
    return <EmptyState icon={Users} title="Loading households" text="Household access is being synced." />;
  }

  const selectedHousehold = households.households.find(
    (household) => household.id === selectedHouseholdId,
  );
  const canManageSelectedHousehold = selectedHousehold?.kind === "Family"
    && selectedHousehold.canWrite
    && (selectedHousehold.role === "Owner" || selectedHousehold.role === "Admin");
  const canEditSelectedSettings = Boolean(
    selectedHousehold?.canWrite
    && (selectedHousehold.role === "Owner" || selectedHousehold.role === "Admin"),
  );

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Household</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Personal is the default scope. Premium entitlement is managed by MoneyMentor support.
              </p>
            </div>
            <span className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
              {households.plan}
            </span>
          </div>

          {statusMessage ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
              {statusMessage}
            </p>
          ) : null}

          {invitations.length > 0 ? (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold">Invitations for you</h3>
              <div className="mt-3 grid gap-3">
                {invitations.map((invitation) => (
                  <article className="rounded-lg border border-[var(--border)] bg-white p-3" key={invitation.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{invitation.householdName}</p>
                        <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                          {invitation.invitedByDisplayName} invited you as {invitation.role}. Expires {formatDate(invitation.expiresAt)}.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-bold text-[var(--muted)] disabled:opacity-65"
                          disabled={isSaving}
                          onClick={() => onInvitationResponse(invitation.id, "decline")}
                          type="button"
                        >
                          Decline
                        </button>
                        <button
                          className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-65"
                          disabled={isSaving}
                          onClick={() => onInvitationResponse(invitation.id, "accept")}
                          type="button"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {households.households.length > 0 ? (
              households.households.map((household) => (
                  <button
                    className={`rounded-lg border p-4 text-left transition ${
                      selectedHouseholdId === household.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                    key={household.id}
                    onClick={() => onSelectedHouseholdChange(household.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{household.name}</p>
                      <span className="text-xs font-bold text-[var(--muted)]">{household.role}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--muted)]">
                      {household.memberCount} member{household.memberCount === 1 ? "" : "s"} - {household.status}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                      {household.currencyCode} · {household.timeZone}
                    </p>
                  </button>
              ))
            ) : (
              <EmptyInline text="No households are available." />
            )}
          </div>

          {sentInvitations.length > 0 ? (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-base font-semibold">Sent invitations</h3>
              <div className="mt-3 grid gap-2">
                {sentInvitations.map((invitation) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3" key={invitation.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{invitation.email}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{invitation.role} - {invitation.status}</p>
                    </div>
                    <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-bold text-[var(--accent)]">{invitation.deliveryStatus}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <aside className="space-y-5">
          {selectedHousehold ? (
            <form className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm" key={selectedHousehold.id} onSubmit={onSaveHouseholdSettings}>
              <h3 className="text-lg font-semibold">Report settings</h3>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Time zone changes apply to future report windows. Currency locks after the first transaction.
              </p>
              <Field label="Currency">
                <input className="form-control uppercase" defaultValue={selectedHousehold.currencyCode} maxLength={3} name="currencyCode" required />
              </Field>
              <Field label="IANA time zone">
                <input className="form-control" defaultValue={selectedHousehold.timeZone} name="timeZone" placeholder="Asia/Kolkata" required />
              </Field>
              <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65" disabled={isSaving || !canEditSelectedSettings} type="submit">
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save report settings"}
              </button>
            </form>
          ) : null}

          <form className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm" onSubmit={onCreateHousehold}>
            <h3 className="text-lg font-semibold">Create household</h3>
            <Field label="Household name">
              <input
                className="form-control"
                onChange={(event) => onHouseholdNameChange(event.target.value)}
                placeholder="Family workspace"
                value={householdName}
              />
            </Field>
            <button
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
              disabled={isSaving || !households.canUseHouseholds}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              Create household
            </button>
          </form>

          <form className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm" onSubmit={onAddMember}>
            <h3 className="text-lg font-semibold">Invite member</h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">
              They can accept after signing in with this email.
            </p>
            <Field label="Email">
              <input
                className="form-control"
                onChange={(event) => onMemberEmailChange(event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={memberEmail}
              />
            </Field>
            <Field label="Role">
              <select
                className="form-control"
                onChange={(event) => onMemberRoleChange(event.target.value as HouseholdRole)}
                value={memberRole}
              >
                <option value="Admin">Admin</option>
                <option value="Member">Member</option>
                <option value="Viewer">Viewer</option>
              </select>
            </Field>
            <button
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
              disabled={isSaving || !canManageSelectedHousehold}
              type="submit"
            >
              <UserPlus className="h-4 w-4" />
              Send invitation
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function SettingsSection({
  deletionConfirmation,
  deletionPassword,
  form,
  isPrivacyWorking,
  isSaving,
  onDeleteAccount,
  onDeletionConfirmationChange,
  onDeletionPasswordChange,
  onExportData,
  onFormChange,
  onSave,
}: {
  deletionConfirmation: string;
  deletionPassword: string;
  form: SettingsForm | null;
  isPrivacyWorking: boolean;
  isSaving: boolean;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
  onDeletionConfirmationChange: (value: string) => void;
  onDeletionPasswordChange: (value: string) => void;
  onExportData: () => void;
  onFormChange: (form: SettingsForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!form) {
    return <EmptyState icon={Settings} title="Loading settings" text="Preferences are being synced." />;
  }

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSave}>
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Settings</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">Backend profile preferences.</p>
            </div>
            <Settings className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Default currency">
              <input
                className="form-control uppercase"
                maxLength={3}
                onChange={(event) => onFormChange({ ...form, currencyCode: event.target.value.toUpperCase() })}
                value={form.currencyCode}
              />
            </Field>
            <Field label="Time zone">
              <input
                className="form-control"
                onChange={(event) => onFormChange({ ...form, timeZone: event.target.value })}
                value={form.timeZone}
              />
            </Field>
            <Field label="Plan">
              <input className="form-control" readOnly value={form.plan} />
              <span className="text-xs font-medium text-[var(--muted)]">Entitlements are server-controlled. Contact support for beta access changes.</span>
            </Field>
            <Field label="Default visibility">
              <select
                className="form-control"
                onChange={(event) =>
                  onFormChange({
                    ...form,
                    defaultTransactionVisibility: event.target.value as TransactionVisibility,
                  })
                }
                value={form.defaultTransactionVisibility}
              >
                <option value="Private">Private</option>
                <option value="Household">Household</option>
              </select>
            </Field>
          </div>
        </article>

        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">Capture preferences</h3>
          <div className="mt-4 space-y-3">
            <PreferenceToggle
              checked={form.requireMerchantForExpenses}
              description="Ask a follow-up when an expense does not include a merchant."
              label="Require merchant for expenses"
              onChange={(checked) => onFormChange({ ...form, requireMerchantForExpenses: checked })}
            />
          </div>
          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
            disabled={isSaving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save settings"}
          </button>
        </article>
      </form>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Your privacy data</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Download a versioned JSON copy of your profile, consent history, memberships, invitations, transactions including trash, and other user-owned records.</p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-bold disabled:opacity-60" disabled={isPrivacyWorking} onClick={onExportData} type="button">
            <Download className="h-4 w-4" /> Export my data
          </button>
          <p className="mt-4 text-sm font-medium text-[var(--muted)]">Support: <a className="font-bold text-[var(--accent)] underline" href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@moneymentor.example"}`}>{process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@moneymentor.example"}</a></p>
          <Link className="mt-2 inline-flex text-sm font-bold text-[var(--accent)] underline" href="/privacy" target="_blank">Read the beta privacy policy</Link>
        </article>

        <form className="rounded-lg border border-red-200 bg-white p-4 shadow-sm" onSubmit={onDeleteAccount}>
          <h3 className="text-lg font-semibold text-red-800">Delete account</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">This deletes private data and anonymizes eligible shared household records. Enter your password and type DELETE.</p>
          <Field label="Current password">
            <input autoComplete="current-password" className="form-control" onChange={(event) => onDeletionPasswordChange(event.target.value)} required type="password" value={deletionPassword} />
          </Field>
          <Field label="Confirmation">
            <input className="form-control" onChange={(event) => onDeletionConfirmationChange(event.target.value)} placeholder="DELETE" required value={deletionConfirmation} />
          </Field>
          <button className="mt-4 rounded-lg bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={isPrivacyWorking || deletionConfirmation !== "DELETE"} type="submit">Delete my account</button>
        </form>
      </div>
    </section>
  );
}

function TransactionRow({
  canWrite = true,
  compact = false,
  onDelete,
  onEdit,
  transaction,
}: {
  canWrite?: boolean;
  compact?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  transaction: TransactionListItem;
}) {
  const isIncome = transaction.type === "Income";
  const transactionLabel = isIncome
    ? transaction.reason ?? (transaction.senderName ? `Income from ${transaction.senderName}` : transaction.sourceText)
    : transaction.description ?? transaction.merchantName ?? transaction.sourceText;

  return (
    <article className={`flex items-center justify-between gap-3 ${compact ? "py-3" : "py-4"}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {transactionLabel}
          </p>
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${isIncome ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
            {transaction.type}
          </span>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">
          {transaction.categoryName ?? "Uncategorized"}
          {isIncome && transaction.senderName ? ` - From ${transaction.senderName}` : ""}
          {!isIncome && transaction.merchantName ? ` - ${transaction.merchantName}` : ""}
          {" - "}
          {formatDate(transaction.transactionDate)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p className={`text-sm font-bold ${isIncome ? "text-emerald-700" : "text-[var(--ink)]"}`}>
          {isIncome ? "+" : "-"}
          {formatMoney(transaction.amount, transaction.currencyCode)}
        </p>
        {onEdit ? (
          <button
            aria-label={`Edit transaction ${transactionLabel}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            disabled={!canWrite}
            onClick={onEdit}
            title="Edit transaction"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            aria-label={`Delete transaction ${transactionLabel}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canWrite}
            onClick={onDelete}
            title={canWrite ? "Move to trash" : "Viewer access is read-only"}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`chat-message-row flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`chat-message-bubble max-w-[82%] rounded-2xl px-4 py-3 text-sm font-medium leading-6 shadow-sm sm:max-w-[74%] ${
          isUser ? "chat-message-bubble--user rounded-br-md" : "chat-message-bubble--assistant rounded-bl-md"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="chat-message-row flex justify-start" aria-live="polite">
      <div className="chat-message-bubble chat-message-bubble--assistant rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <span className="flex h-6 items-center gap-1.5">
          <span className="typing-dot" />
          <span className="typing-dot typing-dot--delay-1" />
          <span className="typing-dot typing-dot--delay-2" />
        </span>
      </div>
    </div>
  );
}

function VoiceAiButton({
  disabled,
  isListening,
  onClick,
}: {
  disabled: boolean;
  isListening: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={isListening ? "Stop voice input" : "Start voice input"}
      className={`ai-voice-button grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--accent)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
        isListening ? "ai-voice-button--listening" : ""
      }`}
      disabled={disabled}
      onClick={onClick}
      title={isListening ? "Stop voice input" : "Start voice input"}
      type="button"
    >
      <Mic className="h-5 w-5" />
    </button>
  );
}

function VoiceWavePanel() {
  return (
    <div
      aria-live="polite"
      className="voice-recording-panel mx-3 mb-3 rounded-lg border border-[var(--accent)] bg-[var(--ink)] px-4 py-3 text-white shadow-lg"
      data-testid="voice-wave"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Recording</p>
          <p className="mt-1 text-xs font-medium text-white/70">I will send it when speech is captured.</p>
        </div>
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} style={{ animationDelay: `${index * 55}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PreferenceToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-24 cursor-pointer items-start justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <span>
        <span className="block text-sm font-semibold text-[var(--ink)]">{label}</span>
        <span className="mt-2 block text-sm font-medium leading-6 text-[var(--muted)]">
          {description}
        </span>
      </span>
      <input
        checked={checked}
        className="toggle-control"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({
  icon: Icon,
  text,
  title,
}: {
  icon: typeof Bot;
  text: string;
  title: string;
}) {
  return (
    <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-white text-[var(--accent)] shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-[var(--muted)]">{text}</p>
      </div>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center text-sm font-medium leading-6 text-[var(--muted)]">
      {text}
    </p>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-white/58">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function SignedOutHome() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 text-center shadow-[0_18px_55px_rgba(16,43,38,0.08)]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--ink)] text-white">
          <BrandMarkIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-normal">MoneyMentor</h1>
        <p className="mt-3 text-base font-medium leading-7 text-[var(--muted)]">
          Sign in to use the assistant input workspace.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white"
            href="/login"
          >
            Login
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-bold text-[var(--ink)]"
            href="/signup"
          >
            Sign up
          </Link>
        </div>
      </section>
    </main>
  );
}

function getFallbackAssistantMessage(result: AssistantMessageResponse) {
  if (result.status === "NeedsClarification") {
    return "I need a little more detail before saving this.";
  }

  if (result.transaction) {
    return "Tracked that expense.";
  }

  return "I could not handle that message yet.";
}

function sectionLabel(section: Exclude<AppSection, "home">) {
  return navItems.find((item) => item.section === section)?.label ?? "Dashboard";
}

function toneClass(tone: DashboardJudgement["tone"]) {
  if (tone === "Healthy") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "Watch") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function formatTone(tone: DashboardJudgement["tone"]) {
  return tone.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function looksLikeFinanceQuestion(text: string) {
  return /\b(where|what|which|how much|spent most|total|summary|report)\b/i.test(text);
}

function LoadingSession() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] text-[var(--ink)]">
      <div className="text-center">
        <BrandMarkIcon className="mx-auto h-10 w-10 text-[var(--accent)]" />
        <p className="mt-4 text-sm font-semibold text-[var(--muted)]">Restoring your secure session…</p>
      </div>
    </main>
  );
}

function PrivacyConsentGate({
  isSaving,
  onAccept,
  onSignOut,
}: {
  isSaving: boolean;
  onAccept: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
      <section className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-white p-7 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Privacy update</p>
        <h1 className="mt-3 text-3xl font-semibold">Review the beta privacy policy</h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">
          Before finance features reopen, please review and accept version 2026-07-26-ai-planning.1, which discloses minimized AI goal-planning processing. You can still export or delete your account through the API without accepting.
        </p>
        <Link className="mt-5 inline-flex font-bold text-[var(--accent)] underline" href="/privacy" target="_blank">
          Read the plain-language policy
        </Link>
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="rounded-lg bg-[var(--ink)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={isSaving} onClick={onAccept} type="button">
            {isSaving ? "Recording…" : "Accept and continue"}
          </button>
          <button className="rounded-lg border border-[var(--border)] px-5 py-3 text-sm font-bold" onClick={onSignOut} type="button">
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function shiftMonthKey(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function formatMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function getMonthOptions(selectedMonth: string) {
  const currentMonth = getCurrentMonthKey();
  const options = new Set(
    Array.from({ length: 36 }, (_, index) => shiftMonthKey(currentMonth, -index)),
  );
  options.add(selectedMonth);
  return Array.from(options).sort((left, right) => right.localeCompare(left));
}

function toSettingsForm(settings: UserSettingsResponse): SettingsForm {
  return {
    currencyCode: settings.currencyCode,
    timeZone: settings.timeZone,
    plan: settings.plan,
    requireMerchantForExpenses: settings.requireMerchantForExpenses,
    defaultTransactionVisibility: settings.defaultTransactionVisibility,
  };
}

function toTransactionEditForm(transaction: TransactionListItem): TransactionEditForm {
  return {
    amount: transaction.amount.toString(),
    categoryName: transaction.categoryName ?? "",
    merchantName: transaction.merchantName ?? "",
    description: transaction.description ?? "",
    senderName: transaction.senderName ?? "",
    reason: transaction.reason ?? "",
    transactionDate: transaction.transactionDate.slice(0, 10),
    visibility: transaction.visibility,
  };
}
