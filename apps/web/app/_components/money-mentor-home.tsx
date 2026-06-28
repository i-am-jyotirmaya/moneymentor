"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Send,
  Settings,
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
  CategorySpendSummary,
  DashboardInsight,
  DashboardJudgement,
  HouseholdDashboard,
  HouseholdRole,
  MonthlyDashboardResponse,
  TransactionListItem,
  TransactionVisibility,
  UpdateUserSettingsRequest,
  UserPlan,
  UserSettingsResponse,
} from "@/lib/api";
import {
  addHouseholdMember,
  ApiError,
  createHousehold,
  getMonthlyDashboard,
  getUserSettings,
  listHouseholds,
  listTransactions,
  submitAssistantMessage as sendAssistantMessage,
  updateTransaction,
  updateUserSettings,
} from "@/lib/api";
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  subscribeToAuthSession,
} from "@/lib/auth-session";
import { BrandMarkIcon } from "./icons";

type InputMode = "Text" | "Voice";
export type AppSection = "home" | "dashboard" | "assistant" | "transactions" | "household" | "settings";

type MoneyMentorHomeProps = {
  initialSection?: AppSection;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type TransactionEditForm = {
  amount: string;
  categoryName: string;
  merchantName: string;
  description: string;
  transactionDate: string;
  visibility: TransactionVisibility;
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
  "swiggy dinner 540",
  "where did I spend most this month?",
];

const navItems: Array<{
  section: Exclude<AppSection, "home">;
  label: string;
  icon: typeof Bot;
}> = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "assistant", label: "Assistant", icon: Bot },
  { section: "transactions", label: "Transactions", icon: ReceiptText },
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
      text: "Tell me what you spent, or ask where your money went this month.",
    },
  ]);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm | null>(null);
  const [households, setHouseholds] = useState<HouseholdDashboard | null>(null);
  const [dashboard, setDashboard] = useState<MonthlyDashboardResponse | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionEditForm | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<HouseholdRole>("Member");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [isSavingHousehold, setIsSavingHousehold] = useState(false);
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
        const [settingsResult, transactionResult, householdResult, dashboardResult] = await Promise.all([
          getUserSettings(accessToken),
          listTransactions(accessToken, 50),
          listHouseholds(accessToken),
          getMonthlyDashboard(accessToken, { month: getCurrentMonthKey() }),
        ]);

        setSettings(settingsResult);
        setSettingsForm(toSettingsForm(settingsResult));
        setTransactions(transactionResult);
        setHouseholds(householdResult);
        setDashboard(dashboardResult);
        setSelectedHouseholdId((current) => current ?? householdResult.households[0]?.id ?? null);
      } catch (caughtError) {
        handleApiError(caughtError, "Could not load your MoneyMentor workspace.");
      } finally {
        setIsLoadingData(false);
      }
    },
    [handleApiError],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshAppData(session.accessToken);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refreshAppData, session]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function signOut() {
    clearAuthSession();
    router.push("/login");
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

    setError(null);
    setIsSubmitting(true);
    setText("");
    setInputMode(mode);
    appendMessage("user", normalizedText);

    try {
      const result = await sendAssistantMessage(session.accessToken, {
        text: normalizedText,
        inputMode: mode,
        transactionDate: new Date().toISOString().slice(0, 10),
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
      listTransactions(accessToken, 50),
      getMonthlyDashboard(accessToken, { month: getCurrentMonthKey() }),
    ]);

    setTransactions(transactionResult);
    setDashboard(dashboardResult);
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
        merchantName: editForm.merchantName,
        description: editForm.description,
        transactionDate: editForm.transactionDate,
        visibility: editForm.visibility,
      });

      setTransactions((current) =>
        current.map((transaction) => (transaction.id === updated.id ? updated : transaction)),
      );
      setEditForm(toTransactionEditForm(updated));
      appendMessage("assistant", `Updated ${updated.description ?? "that transaction"}.`);
      await refreshDashboardAndTransactions(session.accessToken);
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
        plan: settingsForm.plan,
        requireMerchantForExpenses: settingsForm.requireMerchantForExpenses,
        defaultTransactionVisibility: settingsForm.defaultTransactionVisibility,
      };
      const updated = await updateUserSettings(session.accessToken, payload);
      setSettings(updated);
      setSettingsForm(toSettingsForm(updated));
      setHouseholds(await listHouseholds(session.accessToken));
      setDashboard(await getMonthlyDashboard(session.accessToken, { month: getCurrentMonthKey() }));
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

    try {
      const created = await createHousehold(session.accessToken, householdName.trim());
      const householdResult = await listHouseholds(session.accessToken);
      setHouseholds(householdResult);
      setSelectedHouseholdId(created.id);
      setHouseholdName("");
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

    try {
      await addHouseholdMember(session.accessToken, selectedHouseholdId, {
        email: memberEmail.trim(),
        role: memberRole,
      });
      setHouseholds(await listHouseholds(session.accessToken));
      setMemberEmail("");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not add that household member.");
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function upgradeToPremium() {
    if (!session) {
      return;
    }

    setIsSavingSettings(true);
    setError(null);

    try {
      const updated = await updateUserSettings(session.accessToken, { plan: "Premium" });
      setSettings(updated);
      setSettingsForm(toSettingsForm(updated));
      setHouseholds(await listHouseholds(session.accessToken));
    } catch (caughtError) {
      handleApiError(caughtError, "Could not update your plan.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  if (!session) {
    return <SignedOutHome />;
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
            <WorkspaceError error={error} isLoading={isLoadingData} />
            {renderSection(desktopSection, {
              chatEndRef,
              dashboard,
              editForm,
              households,
              inputMode,
              isListening,
              isSavingHousehold,
              isSavingSettings,
              isSavingTransaction,
              isSubmitting,
              memberEmail,
              memberRole,
              messages,
              onAddMember: handleAddMember,
              onCloseEdit: closeTransactionEditor,
              onCreateHousehold: handleCreateHousehold,
              onEditFormChange: setEditForm,
              onHouseholdNameChange: setHouseholdName,
              onMemberEmailChange: setMemberEmail,
              onMemberRoleChange: setMemberRole,
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
              onUpgrade: upgradeToPremium,
              selectedHouseholdId,
              selectedTransaction,
              settingsForm,
              text,
              transactions,
              householdName,
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
            <WorkspaceError error={error} isLoading={isLoadingData} />
            {renderSection(mobileSection, {
              chatEndRef,
              dashboard,
              editForm,
              households,
              inputMode,
              isListening,
              isSavingHousehold,
              isSavingSettings,
              isSavingTransaction,
              isSubmitting,
              memberEmail,
              memberRole,
              messages,
              onAddMember: handleAddMember,
              onCloseEdit: closeTransactionEditor,
              onCreateHousehold: handleCreateHousehold,
              onEditFormChange: setEditForm,
              onHouseholdNameChange: setHouseholdName,
              onMemberEmailChange: setMemberEmail,
              onMemberRoleChange: setMemberRole,
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
              onUpgrade: upgradeToPremium,
              selectedHouseholdId,
              selectedTransaction,
              settingsForm,
              text,
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
    </main>
  );
}

type SectionRenderProps = {
  chatEndRef: RefObject<HTMLDivElement | null>;
  dashboard: MonthlyDashboardResponse | null;
  editForm: TransactionEditForm | null;
  householdName: string;
  households: HouseholdDashboard | null;
  inputMode: InputMode;
  isListening: boolean;
  isSavingHousehold: boolean;
  isSavingSettings: boolean;
  isSavingTransaction: boolean;
  isSubmitting: boolean;
  memberEmail: string;
  memberRole: HouseholdRole;
  messages: Message[];
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onCloseEdit: () => void;
  onCreateHousehold: (event: FormEvent<HTMLFormElement>) => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onFormChange: (form: SettingsForm) => void;
  onHouseholdNameChange: (value: string) => void;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (role: HouseholdRole) => void;
  onPromptClick: (idea: string) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTransaction: (event: FormEvent<HTMLFormElement>) => void;
  onSelectTransaction: (transaction: TransactionListItem) => void;
  onSelectedHouseholdChange: (householdId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  onUpgrade: () => void;
  selectedHouseholdId: string | null;
  selectedTransaction: TransactionListItem | null;
  settingsForm: SettingsForm | null;
  text: string;
  transactions: TransactionListItem[];
};

function renderSection(section: Exclude<AppSection, "home">, props: SectionRenderProps) {
  if (section === "dashboard") {
    return <DashboardSection dashboard={props.dashboard} transactions={props.transactions} />;
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
        editForm={props.editForm}
        isSaving={props.isSavingTransaction}
        onCloseEdit={props.onCloseEdit}
        onEditFormChange={props.onEditFormChange}
        onSave={props.onSaveTransaction}
        onSelectTransaction={props.onSelectTransaction}
        selectedTransaction={props.selectedTransaction}
        transactions={props.transactions}
      />
    );
  }

  if (section === "household") {
    return (
      <HouseholdSection
        householdName={props.householdName}
        households={props.households}
        isSaving={props.isSavingHousehold || props.isSavingSettings}
        memberEmail={props.memberEmail}
        memberRole={props.memberRole}
        onAddMember={props.onAddMember}
        onCreateHousehold={props.onCreateHousehold}
        onHouseholdNameChange={props.onHouseholdNameChange}
        onMemberEmailChange={props.onMemberEmailChange}
        onMemberRoleChange={props.onMemberRoleChange}
        onSelectedHouseholdChange={props.onSelectedHouseholdChange}
        onUpgrade={props.onUpgrade}
        selectedHouseholdId={props.selectedHouseholdId}
      />
    );
  }

  return (
    <SettingsSection
      form={props.settingsForm}
      isSaving={props.isSavingSettings}
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
  transactions,
}: {
  dashboard: MonthlyDashboardResponse | null;
  transactions: TransactionListItem[];
}) {
  if (!dashboard) {
    return <EmptyState icon={BarChart3} title="Loading dashboard" text="Your real money snapshot is being synced." />;
  }

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">{dashboard.monthLabel}</p>
          <h2 className="text-3xl font-semibold tracking-normal">Dashboard</h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Based on your stored MoneyMentor transactions.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
          <CheckCircle2 className="h-4 w-4" />
          Backend data
        </span>
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

      <TransactionsPanel transactions={transactions.slice(0, 6)} />
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
          <EmptyInline text="No transactions yet. Try typing an expense in the assistant." />
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
    <section className="flex min-h-full flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
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
        title="What did you spend on?"
      />
      <div className="hidden min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm lg:block">
        <h3 className="text-base font-semibold">Recent tracked</h3>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {transactions.slice(0, 5).map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} compact />
          ))}
          {transactions.length === 0 ? <EmptyInline text="Tracked expenses will appear here." /> : null}
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
              placeholder="spent 500 on groceries"
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
          className="mb-4 h-[560px] w-[420px] overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_28px_90px_rgba(16,43,38,0.22)]"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-white px-4 py-3">
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
            title="What did you spend on?"
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
  editForm,
  isSaving,
  onCloseEdit,
  onEditFormChange,
  onSave,
  onSelectTransaction,
  selectedTransaction,
  transactions,
}: {
  editForm: TransactionEditForm | null;
  isSaving: boolean;
  onCloseEdit: () => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSelectTransaction: (transaction: TransactionListItem) => void;
  selectedTransaction: TransactionListItem | null;
  transactions: TransactionListItem[];
}) {
  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Transactions</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Backend records with categories, visibility, and audit-friendly edits.
              </p>
            </div>
            <ReceiptText className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 divide-y divide-[var(--border)]">
            {transactions.length > 0 ? (
              transactions.map((transaction) => (
                <button
                  className="block w-full text-left"
                  key={transaction.id}
                  onClick={() => onSelectTransaction(transaction)}
                  type="button"
                >
                  <TransactionRow transaction={transaction} />
                </button>
              ))
            ) : (
              <EmptyInline text="No transactions yet. Add an expense from the assistant." />
            )}
          </div>
        </article>

        <aside className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          {selectedTransaction && editForm ? (
            <form className="space-y-4" onSubmit={onSave}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Edit transaction</h3>
                  <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                    Last edited by {selectedTransaction.updatedByDisplayName ?? "MoneyMentor"}
                  </p>
                </div>
                <button
                  aria-label="Close transaction editor"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)]"
                  onClick={onCloseEdit}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <Field label="Amount">
                <input
                  className="form-control"
                  min="0.01"
                  onChange={(event) => onEditFormChange({ ...editForm, amount: event.target.value })}
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
              <Field label="Transaction date">
                <input
                  className="form-control"
                  onChange={(event) => onEditFormChange({ ...editForm, transactionDate: event.target.value })}
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

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
                disabled={isSaving}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save transaction"}
              </button>
            </form>
          ) : (
            <EmptyState
              icon={Pencil}
              title="Select a transaction"
              text="Choose a row to review and update the backend record."
            />
          )}
        </aside>
      </div>
    </section>
  );
}

function HouseholdSection({
  householdName,
  households,
  isSaving,
  memberEmail,
  memberRole,
  onAddMember,
  onCreateHousehold,
  onHouseholdNameChange,
  onMemberEmailChange,
  onMemberRoleChange,
  onSelectedHouseholdChange,
  onUpgrade,
  selectedHouseholdId,
}: {
  householdName: string;
  households: HouseholdDashboard | null;
  isSaving: boolean;
  memberEmail: string;
  memberRole: HouseholdRole;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHousehold: (event: FormEvent<HTMLFormElement>) => void;
  onHouseholdNameChange: (value: string) => void;
  onMemberEmailChange: (value: string) => void;
  onMemberRoleChange: (role: HouseholdRole) => void;
  onSelectedHouseholdChange: (householdId: string) => void;
  onUpgrade: () => void;
  selectedHouseholdId: string | null;
}) {
  if (!households) {
    return <EmptyState icon={Users} title="Loading households" text="Household access is being synced." />;
  }

  return (
    <section className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-normal">Household</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Family households are available to Premium profiles.
              </p>
            </div>
            <span className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
              {households.plan}
            </span>
          </div>

          {households.canUseHouseholds ? (
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
                  </button>
                ))
              ) : (
                <EmptyInline text="No family households yet. Create one from the side panel." />
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold">Premium required</p>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--muted)]">
                Upgrade the app profile to test household flows locally.
              </p>
              <button
                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white disabled:opacity-65"
                disabled={isSaving}
                onClick={onUpgrade}
                type="button"
              >
                {isSaving ? "Updating..." : "Mark profile Premium"}
              </button>
            </div>
          )}
        </article>

        <aside className="space-y-5">
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
            <h3 className="text-lg font-semibold">Add member</h3>
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
              disabled={isSaving || !selectedHouseholdId || !households.canUseHouseholds}
              type="submit"
            >
              <UserPlus className="h-4 w-4" />
              Add member
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function SettingsSection({
  form,
  isSaving,
  onFormChange,
  onSave,
}: {
  form: SettingsForm | null;
  isSaving: boolean;
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
              <select
                className="form-control"
                onChange={(event) => onFormChange({ ...form, plan: event.target.value as UserPlan })}
                value={form.plan}
              >
                <option value="Free">Free</option>
                <option value="Premium">Premium</option>
              </select>
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
    </section>
  );
}

function TransactionRow({
  compact = false,
  transaction,
}: {
  compact?: boolean;
  transaction: TransactionListItem;
}) {
  const isIncome = transaction.type === "Income";

  return (
    <article className={`flex items-center justify-between gap-3 ${compact ? "py-3" : "py-4"}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {transaction.description ?? transaction.merchantName ?? transaction.sourceText}
          </p>
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${isIncome ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
            {transaction.type}
          </span>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">
          {transaction.categoryName ?? "Uncategorized"}
          {transaction.merchantName ? ` - ${transaction.merchantName}` : ""}
          {" - "}
          {formatDate(transaction.transactionDate)}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-bold ${isIncome ? "text-emerald-700" : "text-[var(--ink)]"}`}>
        {isIncome ? "+" : "-"}
        {formatMoney(transaction.amount, transaction.currencyCode)}
      </p>
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
    transactionDate: transaction.transactionDate.slice(0, 10),
    visibility: transaction.visibility,
  };
}
