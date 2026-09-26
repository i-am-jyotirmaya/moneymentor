"use client";
import type {
  CategoryCatalogResponse,
  Commitment,
  Goal,
  MonthlyDashboardResponse,
  TransactionListItem,
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from "@/lib/api";
import {
  ApiError,
  acceptPrivacyConsent,
  createHousehold,
  createHouseholdInvitation,
  deleteAccount,
  deleteTransaction,
  downloadPrivacyExport,
  getMonthlyDashboard,
  getUserSettings,
  listCategories,
  listCommitments,
  listDeletedTransactions,
  listGoals,
  listHouseholdInvitations,
  listHouseholds,
  listSentHouseholdInvitations,
  listTransactions,
  logout,
  refreshSession,
  respondToHouseholdInvitation,
  restoreTransaction,
  submitAssistantMessage as sendAssistantMessage,
  updateHouseholdSettings,
  updateTransaction,
  updateUserSettings,
} from "@/lib/api";
import {
  clearAuthSession,
  getAuthSessionSnapshot,
  isAccessTokenExpired,
  saveAuthSession,
  subscribeToAuthSession,
} from "@/lib/auth-session";
import {
  getSpeechTranscription,
  getTextRecognition,
  getProcessingLocation,
  saveExport,

} from "@/lib/platform";
import { assistantInputRequest, inputModes, typedAssistantInput, type AssistantInput } from "@/lib/assistant-input";
import type { SpeechTranscriptionAdapter } from "@/lib/speech-transcription";
import { sanitizeImageText } from "@/lib/image-text-privacy";
import type { ImagePreview } from "../_components/workspace-types";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useProgressRouter as useRouter } from "../_components/navigation-progress";
import { transactionPageSize } from "../_components/workspace-config";
import {
  getCurrentMonthKey,
  getFallbackAssistantMessage,
  looksLikeFinanceQuestion,
  toSettingsForm,
  toTransactionEditForm,
} from "../_components/workspace-format";
import {
  AppSection,
  InputMode,
  Message,
  SettingsForm,
} from "../_components/workspace-types";
import { useHouseholdScopeState } from "./use-household-scope-state";
import { usePrivacyState } from "./use-privacy-state";
import { useTransactionState } from "./use-transaction-state";
import {
  useDesktopViewport,
  useUrlHash,
  useWorkspaceUrl,
  validMonth,
  validPage,
} from "./use-workspace-url";

export function useWorkspaceController() {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToAuthSession,
    getAuthSessionSnapshot,
    () => null,
  );
  const { pathname, params, updateQuery } = useWorkspaceUrl();
  const isDesktop = useDesktopViewport();
  const hash = useUrlHash();
  const activeSection = (
    pathname === "/" ? "home" : pathname.replace(/^\/|\/$/g, "")
  ) as AppSection;
  const visibleSection =
    activeSection === "home"
      ? isDesktop
        ? "dashboard"
        : "assistant"
      : activeSection;
  const requestedMonth = validMonth(params.get("month"));
  const requestedPage = validPage(params.get("page"));
  const requestedHousehold = params.get("household");
  const editId = params.get("edit");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const desktopAssistantOpen = hash === "#assistant";
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

    editForm,
    setEditForm,
    deletedTransactions,
    setDeletedTransactions,
    undoTransaction,
    setUndoTransaction,
    isLoadingTransactions,
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
    setSelectedHouseholdId: storeSelectedHouseholdId,
    householdName,
    setHouseholdName,
    memberEmail,
    setMemberEmail,
    memberRole,
    setMemberRole,
    isSavingHousehold,
    setIsSavingHousehold,
  } = useHouseholdScopeState();
  const [dashboard, setDashboard] = useState<MonthlyDashboardResponse | null>(
    null,
  );
  const [categoryCatalog, setCategoryCatalog] =
    useState<CategoryCatalogResponse | null>(null);
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
  const [isLoadingData, setIsLoadingData] = useState(true);
  const isLoadingDashboard = isLoadingData;
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechTranscriptionAdapter | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const submissionRef = useRef(false);
  const imageAbort = useRef<AbortController | null>(null);
  const imageUrl = useRef<string | null>(null);
  const imageRun = useRef(0);
  const [imageState, setImageState] = useState<ImagePreview | null>(null);
  const imageScope = `${session?.user.id ?? ""}:${selectedHouseholdId ?? ""}`;
  const imagePreview = imageState?.scope === imageScope ? imageState : null;
  useEffect(() => () => {
    imageRun.current++;
    imageAbort.current?.abort();
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
    void getTextRecognition().dispose();
    recognitionRef.current?.stop();
  }, [imageScope]);

  const setSelectedHouseholdId = useCallback(
    (id: string | null) => {
      updateQuery({ household: id, page: null, edit: null });
    },
    [updateQuery],
  );
  const desktopSection = activeSection === "home" ? "dashboard" : activeSection;
  const mobileSection = activeSection === "home" ? "assistant" : activeSection;
  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === editId) ?? null,
    [editId, transactions],
  );
  const income = dashboard?.income ?? 0;
  const spends = dashboard?.spends ?? 0;
  const saved = dashboard?.saved ?? income - spends;
  const currencyCode =
    settings?.currencyCode ?? dashboard?.currencyCode ?? "INR";
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
    async (accessToken: string, isCurrentRequest: () => boolean) => {
      setIsLoadingData(true);
      setError(null);

      try {
        const [settingsResult, householdResult, invitationResult] =
          await Promise.all([
            getUserSettings(accessToken),
            listHouseholds(accessToken),
            listHouseholdInvitations(accessToken),
          ]);
        const effectiveHouseholdId = householdResult.households.some(
          (household) => household.id === requestedHousehold,
        )
          ? requestedHousehold!
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
            page: requestedPage,
            month: requestedMonth,
            pageSize: transactionPageSize,
            householdId: effectiveHouseholdId,
          }),
          getMonthlyDashboard(accessToken, {
            householdId: effectiveHouseholdId,
            month: requestedMonth,
          }),
          listDeletedTransactions(accessToken, effectiveHouseholdId),
          effectiveHousehold?.kind === "Family" &&
          (effectiveHousehold.role === "Owner" ||
            effectiveHousehold.role === "Admin")
            ? listSentHouseholdInvitations(accessToken, effectiveHouseholdId)
            : Promise.resolve([]),
          listCategories(accessToken, effectiveHouseholdId),
          listGoals(accessToken, effectiveHouseholdId),
          listCommitments(accessToken, effectiveHouseholdId),
        ]);

        if (!isCurrentRequest()) {
          return;
        }

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
        storeSelectedHouseholdId(effectiveHouseholdId);
      } catch (caughtError) {
        if (isCurrentRequest()) {
          handleApiError(caughtError, "Could not load your Spndrr workspace.");
        }
      } finally {
        if (isCurrentRequest()) {
          setIsLoadingData(false);
        }
      }
    },
    [
      handleApiError,
      requestedHousehold,
      requestedMonth,
      requestedPage,
      setDeletedTransactions,
      setHouseholdInvitations,
      setHouseholds,
      storeSelectedHouseholdId,
      setSentHouseholdInvitations,
      setTransactionMonth,
      setTransactionPage,
      setTransactions,
    ],
  );

  useEffect(() => {
    const existingSession = getAuthSessionSnapshot();
    if (existingSession && !isAccessTokenExpired(existingSession)) {
      const timeoutId = window.setTimeout(() => setSessionReady(true), 0);
      return () => window.clearTimeout(timeoutId);
    }

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
    let active = true;
    if (!sessionReady || !session || session.requiresPrivacyConsent) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshAppData(session.accessToken, () => active);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [refreshAppData, session, sessionReady]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditForm(
        selectedTransaction ? toTransactionEditForm(selectedTransaction) : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedTransaction, setEditForm]);

  async function signOut() {
    try {
      await logout(session?.accessToken);
    } finally {
      router.push("/login");
    }
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
    updateQuery({ edit: transaction.id });
    setEditForm(toTransactionEditForm(transaction));
  }

  function closeTransactionEditor() {
    updateQuery({ edit: null });
    setEditForm(null);
  }

  function startVoiceInput() {
    if (submissionRef.current || imagePreview || isLoadingData) {
      return;
    }

    setError(null);
    setInputMode("Voice");

    const recognition = getSpeechTranscription();
    if (!recognition) {
      setInputMode("Text");
      setError("Voice input is not available in this browser. You can still type your message.");
      return;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start({
      locale: "en-IN",
      onResult: input => { setText(input.text); void submitAssistantInput(input); },
      onError: () => { setIsListening(false); setInputMode("Text"); setError("I could not catch that clearly. Check microphone permission or try typing."); },
      onEnd: () => setIsListening(false),
    });
  }

  function toggleVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    startVoiceInput();
  }

  async function submitAssistantInput(input: AssistantInput, confirmationToken?: string, clarificationToken?: string) {
    const normalizedText = (input.source === "image" ? sanitizeImageText(input.text) : input.text).trim();
    const mode = inputModes[input.source];
    if (!normalizedText || submissionRef.current) {
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    if (
      !canWriteSelectedHousehold &&
      !looksLikeFinanceQuestion(normalizedText)
    ) {
      setError(
        "This household is read-only for Viewers. You can still ask finance questions.",
      );
      return;
    }

    setError(null);
    submissionRef.current = true;
    const run = imageRun.current;
    const started = performance.now();
    setIsSubmitting(true);
    setText("");
    setInputMode(mode);
    appendMessage("user", normalizedText);

    try {
      const result = await sendAssistantMessage(session.accessToken, {
        ...assistantInputRequest({ ...input, text: normalizedText }, confirmationToken),
        ...(clarificationToken ? { clarificationToken } : {}),
        householdId: selectedHouseholdId ?? undefined,
        currencyCode,
      });
      if (input.source === "image" && run !== imageRun.current) return;
      performance.measure("assistantProcessingMs", { start: started, end: performance.now() });

      appendMessage(
        "assistant",
        result.assistantMessage ?? getFallbackAssistantMessage(result),
      );

      if (result.transaction) {
        setTransactions((current) => [
          result.transaction!,
          ...current.filter(
            (transaction) => transaction.id !== result.transaction!.id,
          ),
        ]);
        await refreshDashboardAndTransactions(session.accessToken);
      }
      return result;
    } catch (caughtError) {
      handleApiError(
        caughtError,
        "Could not reach the Spndrr API. Check that the backend is running.",
      );
    } finally {
      submissionRef.current = false;
      setIsSubmitting(false);
      setInputMode("Text");
    }
  }

  function dismissImage() {
    imageRun.current++;
    imageAbort.current?.abort();
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
    setImageState(null);
    setText("");
    void getTextRecognition().dispose();
  }

  async function previewImageInput(input: AssistantInput, run: number, clarificationToken?: string) {
    if (!input.text.trim() || submissionRef.current) return;
    const sanitized = { ...input, text: sanitizeImageText(input.text) };
    setImageState(current => current ? { ...current, input: sanitized, result: undefined, status: "parsed", error: undefined } : current);
    const result = await submitAssistantInput(sanitized, undefined, clarificationToken);
    if (run !== imageRun.current) return;
    setImageState(current => current ? { ...current, input: { ...sanitized, text: result?.parsedDebug?.sourceText ?? result?.parsedIncomeDebug?.sourceText ?? sanitized.text }, result, status: result ? "needs-confirmation" : "failed",
      error: result ? undefined : "Could not process this text. Edit it or try again." } : current);
  }

  async function selectImage(image: Blob) {
    if (submissionRef.current || isListening || isLoadingData) return;
    dismissImage();
    const run = imageRun.current;
    const started = performance.now();
    const abort = new AbortController();
    imageAbort.current = abort;
    if (!/^image\/(png|jpeg|webp)$/.test(image.type) || image.size > 10 * 1024 * 1024) {
      setImageState({ scope: imageScope, currencyCode, status: "failed", error: "Choose a PNG, JPEG or WebP smaller than 10 MB." });
      return;
    }
    const previewUrl = URL.createObjectURL(image);
    imageUrl.current = previewUrl;
    setImageState({ scope: imageScope, currencyCode, status: "selected", previewUrl });
    try {
      setImageState({ scope: imageScope, currencyCode, status: "reading", previewUrl });
      const input = await getTextRecognition().recognize(image, { locale: "en-IN", signal: abort.signal,
        onProgress: progress => { if (run === imageRun.current) setImageState(current => current ? { ...current, progress } : current); } });
      if (run !== imageRun.current) return;
      performance.measure("ocrDurationMs", { start: started, end: performance.now() });
      await previewImageInput(input, run);
      performance.measure("totalInputDurationMs", { start: started, end: performance.now() });
    } catch (error) {
      if (run === imageRun.current) {
        if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
        imageUrl.current = null;
        setImageState({ scope: imageScope, currencyCode, status: "failed", error: error instanceof Error ? error.message : "Could not read that image. Try another screenshot or type the expense." });
      }
    }
  }

  async function confirmImage() {
    if (!imagePreview?.input || !imagePreview.result?.confirmationToken || submissionRef.current) return;
    const run = imageRun.current;
    const result = await submitAssistantInput(imagePreview.input, imagePreview.result.confirmationToken);
    if (run !== imageRun.current) return;
    if (result?.transaction) dismissImage();
    else setImageState(current => current ? { ...current, result, status: "failed",
      error: result?.assistantMessage ?? "Confirmation could not be completed. Check transactions before previewing again." } : current);
  }

  function editImage() {
    if (!imagePreview?.input || submissionRef.current) return;
    setText(imagePreview.input.text);
    setImageState(current => current ? { ...current, result: undefined, status: "parsed" } : current);
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

  function changeDashboardMonth(month: string) {
    updateQuery({ month, page: null, edit: null });
  }

  function changeTransactionMonth(month: string) {
    updateQuery({ month, page: null, edit: null });
  }

  function changeTransactionPage(page: number) {
    updateQuery({ page: String(page), edit: null });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imagePreview?.input) {
      void previewImageInput({ ...imagePreview.input, text }, imageRun.current, imagePreview.result?.clarificationToken ?? undefined);
    } else if (!imagePreview) {
      void submitAssistantInput(typedAssistantInput(text, getProcessingLocation()));
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
      const updated = await updateTransaction(
        session.accessToken,
        selectedTransaction.id,
        {
          amount,
          categoryName: editForm.categoryName,
          ...(selectedTransaction.type === "Income"
            ? { senderName: editForm.senderName, reason: editForm.reason }
            : {
                merchantName: editForm.merchantName,
                description: editForm.description,
              }),
          transactionDate: editForm.transactionDate,
          visibility: editForm.visibility,
        },
      );

      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === updated.id ? updated : transaction,
        ),
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
      setDashboard(
        await getMonthlyDashboard(session.accessToken, {
          month: dashboardMonth,
          householdId: selectedHouseholdId ?? undefined,
        }),
      );
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
      const created = await createHousehold(
        session.accessToken,
        householdName.trim(),
      );
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
      await createHouseholdInvitation(
        session.accessToken,
        selectedHouseholdId,
        {
          email: memberEmail.trim(),
          role: memberRole,
        },
      );
      setHouseholds(await listHouseholds(session.accessToken));
      setSentHouseholdInvitations(
        await listSentHouseholdInvitations(
          session.accessToken,
          selectedHouseholdId,
        ),
      );
      setHouseholdNotice(`Invitation sent to ${memberEmail.trim()}.`);
      setMemberEmail("");
    } catch (caughtError) {
      handleApiError(caughtError, "Could not send that household invitation.");
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleSaveHouseholdSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!session || !selectedHouseholdId || isSavingHousehold) return;

    const formData = new FormData(event.currentTarget);
    const currencyCode = String(formData.get("currencyCode") ?? "")
      .trim()
      .toUpperCase();
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
      setHouseholds((current) =>
        current
          ? {
              ...current,
              households: current.households.map((household) =>
                household.id === updated.id ? updated : household,
              ),
            }
          : current,
      );
      setHouseholdNotice("Household reporting settings saved.");
    } catch (caughtError) {
      handleApiError(
        caughtError,
        "Could not save household reporting settings.",
      );
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
      if (response === "accept") setSelectedHouseholdId(invitation.householdId);
      setHouseholdNotice(
        response === "accept"
          ? `You joined ${invitation.householdName}.`
          : `Invitation to ${invitation.householdName} declined.`,
      );
    } catch (caughtError) {
      handleApiError(
        caughtError,
        `Could not ${response} that household invitation.`,
      );
    } finally {
      setIsSavingHousehold(false);
    }
  }

  async function handleDeleteTransaction(transaction: TransactionListItem) {
    if (!session || !canWriteSelectedHousehold) return;
    setError(null);
    try {
      const deleted = await deleteTransaction(
        session.accessToken,
        transaction.id,
      );
      setUndoTransaction(deleted);
      setTransactions((current) =>
        current.filter((item) => item.id !== transaction.id),
      );
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
      const restored = await restoreTransaction(
        session.accessToken,
        transaction.id,
      );
      setDeletedTransactions((current) =>
        current.filter((item) => item.id !== transaction.id),
      );
      setUndoTransaction((current) =>
        current?.id === transaction.id ? null : current,
      );
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
      await saveExport(exported.blob, exported.fileName);
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
      router.push("/");
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

  return {
    session,
    updateQuery,
    isDesktop,
    activeSection,
    visibleSection,
    mobileMenuOpen,
    setMobileMenuOpen,
    desktopAssistantOpen,
    text,
    setText,
    inputMode,
    setInputMode,
    isSubmitting,
    isListening,
    messages,
    transactions,
    transactionPage,
    transactionMonth,
    editForm,
    setEditForm,
    deletedTransactions,
    undoTransaction,
    setUndoTransaction,
    isLoadingTransactions,
    isSavingTransaction,
    dashboardMonth,
    settings,
    settingsForm,
    setSettingsForm,
    households,
    householdInvitations,
    sentHouseholdInvitations,
    householdNotice,
    selectedHouseholdId,
    householdName,
    setHouseholdName,
    memberEmail,
    setMemberEmail,
    memberRole,
    setMemberRole,
    isSavingHousehold,
    dashboard,
    categoryCatalog,
    goals,
    commitments,
    sessionReady,
    isAcceptingConsent,
    deletionPassword,
    setDeletionPassword,
    deletionConfirmation,
    setDeletionConfirmation,
    isPrivacyWorking,
    isLoadingData,
    isLoadingDashboard,
    isSavingSettings,
    error,
    chatEndRef,
    setSelectedHouseholdId,
    desktopSection,
    mobileSection,
    selectedTransaction,
    income,
    spends,
    saved,
    currencyCode,
    selectedHousehold,
    canWriteSelectedHousehold,
    greetingName,
    signOut,
    selectTransaction,
    closeTransactionEditor,
    toggleVoiceInput,
    imagePreview,
    selectImage,
    confirmImage,
    editImage,
    dismissImage,
    changeDashboardMonth,
    changeTransactionMonth,
    changeTransactionPage,
    handleSubmit,
    handleSaveTransaction,
    handleSaveSettings,
    handleCreateHousehold,
    handleAddMember,
    handleSaveHouseholdSettings,
    handleInvitationResponse,
    handleDeleteTransaction,
    handleRestoreTransaction,
    handleExportData,
    handleDeleteAccount,
    handleAcceptConsent,
    retryLoad: () => {
      if (session) void refreshAppData(session.accessToken, () => true);
    },
  };
}
