"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  Crown,
  LogOut,
  Mic,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  FormEvent,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ExpenseInputResponse,
  HouseholdDashboard,
  HouseholdRole,
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
  getUserSettings,
  listHouseholds,
  listTransactions,
  submitExpenseInput,
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
export type AppSection = "assistant" | "transactions" | "household" | "settings";

type MoneyMentorHomeProps = {
  initialSection?: AppSection;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
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

const promptIdeas = [
  "groceries for 110 from local market",
  "paid rent 18000",
  "ice cream from zepto",
];

const navItems: Array<{
  section: AppSection;
  label: string;
  href: string;
  icon: typeof Bot;
}> = [
  { section: "assistant", label: "Assistant", href: "/", icon: Bot },
  { section: "transactions", label: "Transactions", href: "/transactions", icon: ReceiptText },
  { section: "household", label: "Household", href: "/household", icon: Users },
  { section: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export function MoneyMentorHome({ initialSection = "assistant" }: MoneyMentorHomeProps) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionSnapshot,
    () => null,
  );
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("Text");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "seed-assistant",
      role: "assistant",
      text: "Tell me what you spent. I will save complete expenses and ask when something important is missing.",
    },
  ]);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm | null>(null);
  const [households, setHouseholds] = useState<HouseholdDashboard | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionEditForm | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<HouseholdRole>("Member");
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [isSavingHousehold, setIsSavingHousehold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions],
  );

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const trackedTotal = useMemo(
    () => transactions.reduce((total, transaction) => total + transaction.amount, 0),
    [transactions],
  );

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
        const [settingsResult, transactionResult, householdResult] = await Promise.all([
          getUserSettings(accessToken),
          listTransactions(accessToken, 50),
          listHouseholds(accessToken),
        ]);

        setSettings(settingsResult);
        setSettingsForm(toSettingsForm(settingsResult));
        setTransactions(transactionResult);
        setHouseholds(householdResult);
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

  function signOut() {
    clearAuthSession();
    router.push("/login");
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

  function logParserDebug(
    sourceText: string,
    submittedInputMode: InputMode,
    result: ExpenseInputResponse,
  ) {
    console.groupCollapsed("[MoneyMentor] Expense input processed");
    console.info("Submitted input", {
      inputMode: submittedInputMode,
      sourceText,
    });
    console.info("Parsed debug", result.parsedDebug);
    console.info("Saved transaction", result.transaction);
    console.info("Full response", result);
    console.groupEnd();
  }

  function getSpeechRecognition() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  }

  function toggleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    startVoiceInput();
  }

  function startVoiceInput() {
    setError(null);

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setInputMode("Text");
      setError("Voice input is not available in this browser. You can still type your expense.");
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
        setInputMode("Voice");
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setError("I could not catch that clearly. Try typing it instead.");
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setInputMode("Voice");
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setInputMode("Text");
      setIsListening(false);
      setError("Voice input could not start. You can still type your message.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceText = text.trim();

    if (!sourceText) {
      setError("Type or speak an expense first.");
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    appendMessage("user", sourceText);

    try {
      const submittedInputMode = inputMode;
      const result = await submitExpenseInput(session.accessToken, {
        text: sourceText,
        inputMode: submittedInputMode,
        transactionDate: new Date().toISOString().slice(0, 10),
        currencyCode: settings?.currencyCode ?? "INR",
        locale: "en-IN",
      });

      logParserDebug(sourceText, submittedInputMode, result);

      appendMessage(
        "assistant",
        result.assistantMessage ??
          (result.transaction ? "Tracked that expense." : "I need a little more detail before saving."),
      );

      if (result.transaction) {
        setTransactions((current) => [result.transaction!, ...current.filter((item) => item.id !== result.transaction!.id)]);
      }

      setText("");
      setInputMode("Text");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not reach MoneyMentor API. Check that the backend is running.");
    } finally {
      setIsSubmitting(false);
    }
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
      const householdResult = await listHouseholds(session.accessToken);
      setHouseholds(householdResult);
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
      const householdResult = await listHouseholds(session.accessToken);
      setHouseholds(householdResult);
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

  const sectionTitle = navItems.find((item) => item.section === initialSection)?.label ?? "Assistant";

  return (
    <main className="h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="grid h-full w-full overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--border)] bg-[var(--sidebar)] px-5 py-6 text-white lg:flex lg:min-h-0 lg:flex-col">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[var(--sidebar)]">
              <BrandMarkIcon className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold">MoneyMentor</span>
          </Link>

          <nav className="mt-9 space-y-1">
            {navItems.map((item) => (
              <SidebarLink
                active={item.section === initialSection}
                href={item.href}
                icon={item.icon}
                key={item.section}
                label={item.label}
              />
            ))}
          </nav>

          <div className="mt-8 rounded-lg border border-white/12 bg-white/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
              This workspace
            </p>
            <div className="mt-4 space-y-3">
              <DashboardStat label="Tracked" value={formatMoney(trackedTotal, settings?.currencyCode ?? "INR")} />
              <DashboardStat label="Transactions" value={transactions.length.toString()} />
              <DashboardStat label="Plan" value={settings?.plan ?? "Free"} />
            </div>
          </div>

          <div className="mt-auto rounded-lg border border-white/12 bg-white/[0.06] p-4">
            <p className="text-sm font-semibold">{session.user.displayName}</p>
            <p className="mt-1 break-words text-xs font-medium text-white/54">
              {session.user.email}
            </p>
            <button
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-[var(--sidebar)] transition hover:bg-[var(--mint)]"
              onClick={signOut}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-[var(--border)] bg-white/82 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-white lg:hidden"
                  href="/"
                >
                  <BrandMarkIcon className="h-6 w-6" />
                </Link>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--muted)]">
                    Welcome, {greetingName}
                  </p>
                  <h1 className="truncate text-2xl font-semibold tracking-normal text-[var(--ink)]">
                    {sectionTitle}
                  </h1>
                </div>
              </div>

              <div className="hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--muted)] shadow-sm sm:flex">
                <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                {isLoadingData ? "Syncing" : "Workspace ready"}
              </div>
            </div>

            <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
              {navItems.map((item) => (
                <MobileNavLink
                  active={item.section === initialSection}
                  href={item.href}
                  icon={item.icon}
                  key={item.section}
                  label={item.label}
                />
              ))}
            </nav>
          </header>

          {error ? (
            <div className="mx-4 mt-3 shrink-0 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger)] sm:mx-6 lg:mx-8">
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
            {initialSection === "assistant" ? (
              <AssistantSection
                chatEndRef={chatEndRef}
                inputMode={inputMode}
                isListening={isListening}
                isSubmitting={isSubmitting}
                messages={messages}
                onPromptClick={(idea) => {
                  setText(idea);
                  setInputMode("Text");
                }}
                onSubmit={handleSubmit}
                onTextChange={(value) => {
                  setText(value);
                  setInputMode("Text");
                }}
                onToggleVoice={toggleVoiceInput}
                recentTransactions={recentTransactions}
                text={text}
              />
            ) : null}

            {initialSection === "transactions" ? (
              <TransactionsSection
                editForm={editForm}
                isSaving={isSavingTransaction}
                onCloseEdit={closeTransactionEditor}
                onEditFormChange={setEditForm}
                onSave={handleSaveTransaction}
                onSelectTransaction={selectTransaction}
                selectedTransaction={selectedTransaction}
                transactions={transactions}
              />
            ) : null}

            {initialSection === "household" ? (
              <HouseholdSection
                householdName={householdName}
                households={households}
                isSaving={isSavingHousehold || isSavingSettings}
                memberEmail={memberEmail}
                memberRole={memberRole}
                onAddMember={handleAddMember}
                onCreateHousehold={handleCreateHousehold}
                onHouseholdNameChange={setHouseholdName}
                onMemberEmailChange={setMemberEmail}
                onMemberRoleChange={setMemberRole}
                onSelectedHouseholdChange={setSelectedHouseholdId}
                onUpgrade={upgradeToPremium}
                selectedHouseholdId={selectedHouseholdId}
              />
            ) : null}

            {initialSection === "settings" ? (
              <SettingsSection
                form={settingsForm}
                isSaving={isSavingSettings}
                onFormChange={setSettingsForm}
                onSave={handleSaveSettings}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
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
  recentTransactions,
  text,
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
  recentTransactions: TransactionListItem[];
  text: string;
}) {
  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="chat-panel flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] shadow-[0_18px_55px_rgba(16,43,38,0.08)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-white/76 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">What did you spend on?</h2>
            <p className="text-sm font-medium text-[var(--muted)]">
              Complete expenses are saved immediately.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs font-bold text-[var(--accent)]">
            <Bot className="h-4 w-4" />
            {inputMode}
          </span>
        </div>

        <div className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-5 lg:px-6">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
          {isSubmitting ? <TypingBubble /> : null}
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-white/88 p-3 backdrop-blur sm:p-4">
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
              aria-label={isSubmitting ? "Saving message" : "Send message"}
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_30px_rgba(15,143,123,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0b7d6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isSubmitting}
              type="submit"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </section>

      <RecentTransactionsPanel transactions={recentTransactions} />
    </div>
  );
}

function RecentTransactionsPanel({ transactions }: { transactions: TransactionListItem[] }) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm xl:block">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Recent tracked</h2>
          <p className="text-sm font-medium text-[var(--muted)]">Saved expenses appear here.</p>
        </div>
        <Wallet className="h-5 w-5 text-[var(--accent)]" />
      </div>

      <div className="mt-4 space-y-2">
        {transactions.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No transactions yet"
            text="Send a complete expense and it will be saved here."
          />
        ) : (
          transactions.map((transaction) => (
            <TransactionRow compact key={transaction.id} transaction={transaction} />
          ))
        )}
      </div>
    </aside>
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
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-h-0 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Tracked transactions</h2>
            <p className="text-sm font-medium text-[var(--muted)]">
              Review and correct saved expenses.
            </p>
          </div>
          <SlidersHorizontal className="h-5 w-5 text-[var(--muted)]" />
        </div>

        <div className="h-full min-h-0 overflow-y-auto p-3 sm:p-4">
          {transactions.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Nothing tracked yet"
              text="Use the assistant to save the first expense."
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <button
                  className={`w-full rounded-lg border p-0 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] ${
                    selectedTransaction?.id === transaction.id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-white"
                  }`}
                  key={transaction.id}
                  onClick={() => onSelectTransaction(transaction)}
                  type="button"
                >
                  <TransactionRow transaction={transaction} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <TransactionEditPanel
        editForm={editForm}
        isSaving={isSaving}
        onClose={onCloseEdit}
        onEditFormChange={onEditFormChange}
        onSave={onSave}
        transaction={selectedTransaction}
      />
    </div>
  );
}

function TransactionEditPanel({
  editForm,
  isSaving,
  onClose,
  onEditFormChange,
  onSave,
  transaction,
}: {
  editForm: TransactionEditForm | null;
  isSaving: boolean;
  onClose: () => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  transaction: TransactionListItem | null;
}) {
  if (!transaction || !editForm) {
    return (
      <aside className="hidden rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm xl:block">
        <EmptyState
          icon={Pencil}
          title="Select a transaction"
          text="Choose a row to edit amount, category, merchant, visibility, or date."
        />
      </aside>
    );
  }

  return (
    <aside className="min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Edit transaction</h2>
          <p className="text-sm font-medium text-[var(--muted)]">
            Changes are audit logged.
          </p>
        </div>
        <button
          aria-label="Close transaction editor"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={onSave}>
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
          <textarea
            className="form-control min-h-24 resize-none py-3"
            onChange={(event) => onEditFormChange({ ...editForm, description: event.target.value })}
            value={editForm.description}
          />
        </Field>
        <Field label="Date">
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

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--muted)]">
          Last edited by {transaction.updatedByDisplayName ?? "this user"} on {formatDate(transaction.updatedAt)}.
        </div>

        <button
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white transition hover:bg-[#173d36] disabled:cursor-not-allowed disabled:opacity-65"
          disabled={isSaving}
          type="submit"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving" : "Save changes"}
        </button>
      </form>
    </aside>
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
    <section className="h-full min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-base font-semibold">Preferences</h2>
          <p className="text-sm font-medium text-[var(--muted)]">
            Tune how MoneyMentor captures expenses.
          </p>
        </div>
        <Settings className="h-5 w-5 text-[var(--accent)]" />
      </div>

      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={onSave}>
        <PreferenceToggle
          checked={form.requireMerchantForExpenses}
          description="When enabled, expenses without a merchant ask a follow-up before saving."
          label="Reprompt for missing merchant"
          onChange={(checked) => onFormChange({ ...form, requireMerchantForExpenses: checked })}
        />
        <PreferenceToggle
          checked={form.defaultTransactionVisibility === "Household"}
          description="New tracked expenses can default to household-visible when you choose."
          label="Default to household visibility"
          onChange={(checked) =>
            onFormChange({
              ...form,
              defaultTransactionVisibility: checked ? "Household" : "Private",
            })
          }
        />

        <Field label="Currency">
          <input
            className="form-control"
            maxLength={3}
            onChange={(event) => onFormChange({ ...form, currencyCode: event.target.value.toUpperCase() })}
            value={form.currencyCode}
          />
        </Field>
        <Field label="Timezone">
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

        <div className="flex items-end">
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white transition hover:bg-[#173d36] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSaving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving" : "Save preferences"}
          </button>
        </div>
      </form>
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
  onMemberRoleChange: (value: HouseholdRole) => void;
  onSelectedHouseholdChange: (value: string) => void;
  onUpgrade: () => void;
  selectedHouseholdId: string | null;
}) {
  if (!households) {
    return <EmptyState icon={Users} title="Loading households" text="Household status is being synced." />;
  }

  if (!households.canUseHouseholds) {
    return (
      <section className="grid h-full place-items-center rounded-lg border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <Crown className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-normal">Households require Premium</h2>
          <p className="mt-3 text-sm font-medium leading-6 text-[var(--muted)]">
            Free users can keep tracking expenses in a private personal workspace. Premium unlocks shared household tracking.
          </p>
          <button
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 text-sm font-bold text-white transition hover:bg-[#173d36] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSaving}
            onClick={onUpgrade}
            type="button"
          >
            <Crown className="h-4 w-4" />
            {isSaving ? "Updating" : "Switch to Premium"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-base font-semibold">Family households</h2>
            <p className="text-sm font-medium text-[var(--muted)]">Premium workspace sharing.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
        </div>

        <div className="mt-4 space-y-2">
          {households.households.length === 0 ? (
            <EmptyState icon={Users} title="No family household yet" text="Create one to start shared tracking." />
          ) : (
            households.households.map((household) => (
              <button
                className={`w-full rounded-lg border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] ${
                  selectedHouseholdId === household.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-white"
                }`}
                key={household.id}
                onClick={() => onSelectedHouseholdChange(household.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{household.name}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                      {household.memberCount} members · {household.role}
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-[var(--accent)]" />
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
        <form className="space-y-3" onSubmit={onCreateHousehold}>
          <h2 className="text-base font-semibold">Create household</h2>
          <Field label="Household name">
            <input
              className="form-control"
              onChange={(event) => onHouseholdNameChange(event.target.value)}
              placeholder="Shah family"
              value={householdName}
            />
          </Field>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-bold text-white transition hover:bg-[#173d36] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSaving}
            type="submit"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </form>

        <form className="mt-7 space-y-3 border-t border-[var(--border)] pt-5" onSubmit={onAddMember}>
          <h2 className="text-base font-semibold">Add member</h2>
          <Field label="Email">
            <input
              className="form-control"
              onChange={(event) => onMemberEmailChange(event.target.value)}
              placeholder="member@example.com"
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
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-bold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSaving || !selectedHouseholdId}
            type="submit"
          >
            <UserPlus className="h-4 w-4" />
            Add to selected household
          </button>
        </form>
      </aside>
    </div>
  );
}

function TransactionRow({
  compact = false,
  transaction,
}: {
  compact?: boolean;
  transaction: TransactionListItem;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${compact ? "px-0 py-2" : "px-4 py-3"}`}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {transaction.description ?? transaction.merchantName ?? "Expense"}
          </p>
          <span className="shrink-0 rounded-md bg-[var(--surface)] px-2 py-1 text-[11px] font-bold text-[var(--muted)]">
            {transaction.visibility}
          </span>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">
          {transaction.categoryName ?? "Uncategorized"}
          {transaction.merchantName ? ` - ${transaction.merchantName}` : ""}
          {" - "}
          {formatDate(transaction.transactionDate)}
        </p>
        {transaction.updatedByDisplayName ? (
          <p className="mt-1 truncate text-xs font-medium text-[var(--muted-2)]">
            Last edited by {transaction.updatedByDisplayName}
          </p>
        ) : null}
      </div>
      <p className="shrink-0 text-sm font-bold text-[var(--ink)]">
        {formatMoney(transaction.amount, transaction.currencyCode)}
      </p>
    </div>
  );
}

function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`chat-message-row flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`chat-message-bubble max-w-[82%] rounded-2xl px-4 py-3 text-sm font-medium leading-6 shadow-sm sm:max-w-[74%] ${
          isUser
            ? "chat-message-bubble--user rounded-br-md"
            : "chat-message-bubble--assistant rounded-bl-md"
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

function SidebarLink({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: typeof Bot;
  label: string;
}) {
  return (
    <Link
      className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
        active
          ? "bg-white text-[var(--sidebar)]"
          : "text-white/72 hover:bg-white/10 hover:text-white"
      }`}
      href={href}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

function MobileNavLink({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: typeof Bot;
  label: string;
}) {
  return (
    <Link
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] bg-white text-[var(--muted)]"
      }`}
      href={href}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-white/58">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
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
    <label className="flex min-h-28 cursor-pointer items-start justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
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
