"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ExpenseInputResponse } from "@/lib/api";
import { ApiError, submitExpenseInput } from "@/lib/api";
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  subscribeToAuthSession,
} from "@/lib/auth-session";
import {
  BrandMarkIcon,
  DashboardIcon,
  GoalIcon,
  MicIcon,
  SendIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";

type InputMode = "Text" | "Voice";

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

const promptIdeas = [
  "groceries for 110 from local market",
  "paid rent 18000",
  "ice cream from zepto",
];

const dashboardMenu = [
  { label: "Overview", icon: DashboardIcon, active: true },
  { label: "Spending", icon: WalletIcon, active: false },
  { label: "Goals", icon: GoalIcon, active: false },
  { label: "Household", icon: UsersIcon, active: false },
];

export function MoneyMentorHome() {
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
      text: "Tell me what you spent, or ask a quick finance question.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const greetingName = useMemo(() => {
    const name = session?.user.displayName?.trim();
    return name ? name.split(/\s+/)[0] : "there";
  }, [session]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSubmitting]);

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

  function logParserDebug(
    sourceText: string,
    submittedInputMode: InputMode,
    result: ExpenseInputResponse,
  ) {
    console.groupCollapsed("[MoneyMentor] Submitted parser result");
    console.info("Submitted input", {
      inputMode: submittedInputMode,
      sourceText,
    });
    console.info("Parser draft", result.draft);
    console.info("Assistant message", result.assistantMessage);
    console.info("Full parser response", result);
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
        currencyCode: "INR",
        locale: "en-IN",
      });

      logParserDebug(sourceText, submittedInputMode, result);

      const assistantText =
        result.assistantMessage ??
        "I understood that input. Nothing has been saved yet.";

      appendMessage("assistant", assistantText);
      setText("");
      setInputMode("Text");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        if (caughtError.status === 401) {
          clearAuthSession();
          router.push("/login");
          return;
        }

        setError(caughtError.errors.join(" "));
      } else {
        setError("Could not reach MoneyMentor API. Check that the backend is running.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session) {
    return <SignedOutHome />;
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--border)] bg-[var(--sidebar)] px-5 py-6 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[var(--sidebar)]">
              <BrandMarkIcon className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold">MoneyMentor</span>
          </div>

          <nav className="mt-10 space-y-1">
            {dashboardMenu.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                    item.active
                      ? "bg-white text-[var(--sidebar)]"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  }`}
                  key={item.label}
                  type="button"
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-10 rounded-lg border border-white/12 bg-white/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
              Assistant mode
            </p>
            <p className="mt-3 text-2xl font-semibold">No saves yet</p>
            <p className="mt-2 text-sm font-medium leading-6 text-white/66">
              Messages are interpreted before any tracked data is stored.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-white/12 bg-white/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
              This month
            </p>
            <div className="mt-4 space-y-3">
              <DashboardStat label="Tracked total" value="Pending" />
              <DashboardStat label="Insights" value="Soon" />
              <DashboardStat label="Household" value="Private" />
            </div>
          </div>

          <div className="mt-auto rounded-lg border border-white/12 bg-white/[0.06] p-4">
            <p className="text-sm font-semibold">{session.user.displayName}</p>
            <p className="mt-1 break-words text-xs font-medium text-white/54">
              {session.user.email}
            </p>
            <button
              className="mt-4 h-10 w-full rounded-lg bg-white px-3 text-sm font-bold text-[var(--sidebar)] transition hover:bg-[var(--mint)]"
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-10 lg:py-8">
          <header className="flex items-center justify-between gap-4 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
                <BrandMarkIcon className="h-6 w-6" />
              </span>
              <span className="text-lg font-semibold">MoneyMentor</span>
            </div>
            <button
              className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--ink)]"
              onClick={signOut}
              type="button"
            >
              Sign out
            </button>
          </header>

          <div className="hidden items-center justify-between gap-6 lg:flex">
            <div>
              <p className="text-sm font-semibold text-[var(--muted)]">
                Welcome, {greetingName}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                Capture first. Save later.
              </h1>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)] shadow-sm">
              Backend parser connected
            </div>
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col pt-6 lg:pt-8">
            <div className="mb-4 lg:hidden">
              <p className="text-sm font-semibold text-[var(--muted)]">
                Welcome, {greetingName}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                What did you spend on?
              </h1>
            </div>

            <section className="chat-panel flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border)] shadow-[0_18px_55px_rgba(16,43,38,0.08)]">
              <div className="chat-scroll flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-5 lg:px-6">
                {messages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} />
                ))}
                {isSubmitting ? <TypingBubble /> : null}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-[var(--border)] bg-white/86 p-3 backdrop-blur sm:p-4">
                <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
                  {promptIdeas.map((idea) => (
                    <button
                      className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--ink)]"
                      key={idea}
                      onClick={() => {
                        setText(idea);
                        setInputMode("Text");
                      }}
                      type="button"
                    >
                      {idea}
                    </button>
                  ))}
                </div>

                {error ? (
                  <p className="mb-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium leading-6 text-[var(--danger)]">
                    {error}
                  </p>
                ) : null}

                <form className="flex items-end gap-2" onSubmit={handleSubmit}>
                  <div className="chat-text-bar flex min-h-14 flex-1 items-end gap-2 rounded-full border border-[var(--border)] bg-white px-2 py-2 shadow-inner transition">
                    <textarea
                      aria-label="Message MoneyMentor"
                      className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base font-medium leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-2)]"
                      onChange={(event) => {
                        setText(event.target.value);
                        setInputMode("Text");
                      }}
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
                      onClick={toggleVoiceInput}
                    />
                  </div>

                  <button
                    aria-label={isSubmitting ? "Parsing message" : "Send message"}
                    className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_12px_30px_rgba(15,143,123,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0b7d6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    <SendIcon className="h-5 w-5" />
                  </button>
                </form>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SignedOutHome() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--ink)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-6 text-center shadow-[0_18px_55px_rgba(16,43,38,0.08)]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--ink)] text-white">
          <BrandMarkIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-normal">
          MoneyMentor
        </h1>
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

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-white/58">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`chat-message-row flex ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
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
      <BrandMarkIcon className="h-6 w-6" />
      <MicIcon className="absolute h-4 w-4 translate-x-2.5 translate-y-2.5 rounded-full bg-white/95 p-0.5 text-[var(--accent)] shadow-sm" />
    </button>
  );
}
