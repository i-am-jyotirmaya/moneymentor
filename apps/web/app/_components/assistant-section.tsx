"use client";

import type { TransactionListItem } from "@/lib/api";
import { Bot, Mic, Send, X } from "lucide-react";
import { FormEvent, RefObject } from "react";
import { EmptyInline, TransactionRow } from "./common-ui";
import { promptIdeas } from "./workspace-config";
import { InputMode, Message } from "./workspace-types";

export function AssistantSection({
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
    <div
      className={`chat-panel flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "rounded-lg" : ""}`}
    >
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
              aria-label="Message Spndrr"
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

export function TypingBubble() {
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
      className="voice-recording-panel mx-3 mb-3 rounded-lg border border-[var(--accent)] bg-[var(--ink)] px-4 py-3 text-white shadow-lg"
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
