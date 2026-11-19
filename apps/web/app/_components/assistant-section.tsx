"use client";

import type { TransactionListItem } from "@/lib/api";
import { ArrowUp, ArrowUpLeft, Bot, CheckCircle2, MessageSquare, Mic, Pencil, Send, Undo2, X } from "lucide-react";
import { FormEvent, RefObject, useEffect, useRef, useState } from "react";
import { useWorkspaceUrl } from "../_hooks/use-workspace-url";
import { EmptyInline, TransactionRow } from "./common-ui";
import { useSpndrrWeb } from "./web-design";
import { promptIdeas } from "./workspace-config";
import { InputMode, Message } from "./workspace-types";
import { formatMoney } from "./workspace-format";

type CaptureFeedback = {
  canWrite: boolean;
  householdId: string | null;
  transactions: TransactionListItem[];
  deletedTransactions: TransactionListItem[];
  onDelete: (transaction: TransactionListItem) => Promise<void>;
  onEdit: (transaction: TransactionListItem) => void;
};

const exampleGroups = [
  { intent: "add", label: "Log a transaction", examples: ["Spent 450 on groceries", "Got salary 50,000 today", "Paid 1,200 for subscriptions"] },
  { intent: "ask", label: "Ask about your money", examples: ["Where did I spend most this month?", "How much did I spend on groceries?"] },
] as const;

export function AssistantSection({
  canWrite,
  chatEndRef,
  deletedTransactions,
  householdId,
  inputMode,
  isListening,
  isSubmitting,
  messages,
  onDeleteTransaction,
  onPromptClick,
  onSelectTransaction,
  onSubmit,
  onTextChange,
  onToggleVoice,
  text,
  transactions,
}: {
  canWrite: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  deletedTransactions: TransactionListItem[];
  householdId: string | null;
  inputMode: InputMode;
  isListening: boolean;
  isSubmitting: boolean;
  messages: Message[];
  onDeleteTransaction: (transaction: TransactionListItem) => Promise<void>;
  onPromptClick: (idea: string) => void;
  onSelectTransaction: (transaction: TransactionListItem) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTextChange: (value: string) => void;
  onToggleVoice: () => void;
  text: string;
  transactions: TransactionListItem[];
}) {
  return (
    <section className="assistant-workspace flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
      <ChatSurface
        feedback={{ canWrite, householdId, transactions, deletedTransactions, onDelete: onDeleteTransaction, onEdit: onSelectTransaction }}
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
      <div className="hidden min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-surface p-4 shadow-sm lg:block">
        <h3 className="text-base font-semibold">Recent tracked</h3>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {transactions.slice(0, 5).map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              compact
            />
          ))}
          {transactions.length === 0 ? (
            <EmptyInline text="Tracked expenses and income will appear here." />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ChatSurface({
  chatEndRef,
  compact = false,
  feedback,
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
  feedback?: CaptureFeedback;
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
  const isWeb = useSpndrrWeb();
  const revamp = isWeb && !compact;
  const { params } = useWorkspaceUrl();
  const intent = params.get("compose");
  const composer = useRef<HTMLTextAreaElement>(null);
  const thread = revamp ? messages.filter(({ id }) => id !== "seed-assistant") : messages;
  const isEmpty = revamp && thread.length === 0;
  const groups = feedback?.canWrite === false ? [exampleGroups[1]]
    : intent === "ask" ? [exampleGroups[1], exampleGroups[0]] : exampleGroups;

  useEffect(() => {
    if (revamp && (intent === "add" || intent === "ask")) {
      composer.current?.focus({ preventScroll: true });
    }
  }, [intent, revamp]);

  useEffect(() => {
    if (isEmpty && !isSubmitting) return;
    const scrollArea = chatEndRef.current?.parentElement;
    scrollArea?.scrollTo({ top: scrollArea.scrollHeight });
  }, [chatEndRef, isEmpty, isSubmitting, messages]);

  return (
    <div
      className={`chat-panel flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "rounded-lg" : ""}`}
    >
      {!revamp ? <div className="flex items-center justify-between border-b border-[var(--border)] bg-surface/78 px-4 py-3">
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
      </div> : null}

      <div className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-5">
        {revamp ? <>
          <h1 className="assistant-thread-heading hidden lg:block">{isEmpty ? "Log it, or ask about it." : "Conversation"}</h1>
          <h2 className="assistant-thread-heading lg:hidden">{isEmpty ? "Log it, or ask about it." : "Conversation"}</h2>
        </> : null}
        {isEmpty && onPromptClick ? (
          <div className="assistant-examples">
            <p>Log an expense or income in your own words, or ask a question about your spending.</p>
            {groups.map(({ intent: groupIntent, label, examples }) => {
              const Icon = groupIntent === "add" ? ArrowUpLeft : MessageSquare;
              return (
                <div key={groupIntent} className="assistant-example-group">
                  <h3>{label}</h3>
                  <ul>
                    {examples.map((idea) => (
                      <li key={idea}>
                        <button type="button" onClick={() => {
                          onPromptClick(idea);
                          composer.current?.focus({ preventScroll: true });
                        }}>
                          <Icon aria-hidden="true" size={16} />
                          {idea}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="space-y-3" role={isWeb ? "log" : undefined} aria-label={isWeb ? "Conversation" : undefined}>
          {thread.map((message) => revamp && feedback && message.transaction?.householdId === feedback.householdId
            ? <LoggedTransaction key={message.id} message={message.text} transaction={message.transaction} feedback={feedback} />
            : <ChatMessageBubble key={message.id} message={message} />)}
        </div>
        {isSubmitting ? <TypingBubble announce={isWeb} /> : null}
        <div ref={chatEndRef} />
      </div>

      {isListening ? <VoiceWavePanel /> : null}

      <div className="shrink-0 border-t border-[var(--border)] bg-surface/90 p-3 backdrop-blur">
        {!revamp && showPromptIdeas && onPromptClick ? (
          <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
            {promptIdeas.map((idea) => (
              <button
                className="rounded-lg border border-[var(--border)] bg-surface px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--ink)]"
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
          <div className="chat-text-bar flex min-h-14 flex-1 items-end gap-2 rounded-full border border-[var(--border)] bg-surface px-2 py-2 shadow-inner transition">
            <textarea
              aria-label="Message Spndrr"
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-base font-medium leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-2)]"
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={revamp ? "Log or ask…" : "spent 500 on groceries or got salary 50000"}
              ref={composer}
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
            className="assistant-send inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_12px_30px_rgba(15,143,123,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0b7d6b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-65"
            disabled={isSubmitting}
            type="submit"
          >
            {isWeb ? <ArrowUp aria-hidden="true" className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoggedTransaction({ message, transaction, feedback }: {
  message: string;
  transaction: TransactionListItem;
  feedback: CaptureFeedback;
}) {
  const [working, setWorking] = useState(false);
  const deleted = feedback.deletedTransactions.some(({ id }) => id === transaction.id);
  const current = feedback.transactions.find(({ id }) => id === transaction.id);
  const saved = current ?? transaction;
  const adjustment = (saved.financialImpact?.spending ?? 0) < 0 || (saved.financialImpact?.rewards ?? 0) > 0;
  const sign = saved.type === "Income" || adjustment ? "+" : saved.type === "Expense" ? "−" : "";
  async function undoLog() {
    setWorking(true);
    try { await feedback.onDelete(saved); }
    finally { setWorking(false); }
  }

  return (
    <article className="assistant-transaction">
      <p className="assistant-transaction-status">
        <CheckCircle2 aria-hidden="true" size={16} /> {deleted ? "Moved to Recently Deleted" : "Added to Transactions"}
      </p>
      <div className="assistant-transaction-details">
        <div>
          <p className="font-semibold">{saved.merchantName ?? saved.senderName ?? saved.categoryName ?? saved.type}</p>
          <p className="text-sm text-fg-muted">{saved.categoryName ?? "Uncategorized"}</p>
        </div>
        <strong>{sign}{formatMoney(saved.amount, saved.currencyCode)}</strong>
      </div>
      <p className="text-sm text-fg-muted">{message}</p>
      {feedback.canWrite && !deleted ? <div className="assistant-transaction-actions">
        {current ? <button type="button" onClick={() => feedback.onEdit(current)}><Pencil aria-hidden="true" size={16} /> Edit transaction</button> : null}
        <button disabled={working} type="button" onClick={() => void undoLog()}><Undo2 aria-hidden="true" size={16} /> Undo log</button>
      </div> : null}
    </article>
  );
}

export function DesktopAssistantDock({
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
          className="mb-4 flex h-[560px] w-[420px] min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-surface shadow-[0_28px_90px_rgba(16,43,38,0.22)]"
          role="dialog"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--sp-strong-action,var(--ink))] text-white">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Assistant</p>
                <p className="text-xs font-medium text-[var(--muted)]">
                  Floating workspace
                </p>
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

export function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`chat-message-row flex ${isUser ? "justify-end" : "justify-start"}`}
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

export function TypingBubble({ announce = false }: { announce?: boolean }) {
  return (
    <div className="chat-message-row flex justify-start" role={announce ? "status" : undefined} aria-live="polite">
      {announce ? <span className="sr-only">Spndrr is responding.</span> : null}
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

export function VoiceAiButton({
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

export function VoiceWavePanel() {
  return (
    <div
      aria-live="polite"
      className="voice-recording-panel mx-3 mb-3 rounded-lg border border-[var(--accent)] bg-[var(--sp-strong-action,var(--ink))] px-4 py-3 text-white shadow-lg"
      data-testid="voice-wave"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Recording</p>
          <p className="mt-1 text-xs font-medium text-white/70">
            I will send it when speech is captured.
          </p>
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
