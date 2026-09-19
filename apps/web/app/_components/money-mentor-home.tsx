"use client";
import { RotateCcw, X } from "lucide-react";
import { useWorkspaceController } from "../_hooks/use-workspace-controller";
import { DesktopAssistantDock } from "./assistant-section";
import { LoadingBar, SectionSkeleton } from "./loading-ui";
import { TransactionEditModal } from "./transactions-section";
import {
  LoadingSession,
  PrivacyConsentGate,
  SignedOutHome,
  WorkspaceError,
} from "./workspace-gates";
import {
  DesktopSidebar,
  HouseholdScopeSelector,
  MobileBottomNav,
  MobileHeader,
  MobileMenu,
} from "./workspace-navigation";
import { WorkspaceSection } from "./workspace-section";

export function MoneyMentorHome({ children }: { children?: React.ReactNode }) {
  const {
    session,
    updateQuery,
    isDesktop,
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
    retryLoad,
  } = useWorkspaceController();
  if (!sessionReady) {
    return <LoadingSession />;
  }

  if (!session) {
    return <SignedOutHome />;
  }

  if (session.requiresPrivacyConsent) {
    return (
      <PrivacyConsentGate
        isSaving={isAcceptingConsent}
        onAccept={() => void handleAcceptConsent()}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <LoadingBar
        active={isLoadingData || isLoadingDashboard || isLoadingTransactions}
      />
      {children}
      <div className="flex h-full min-h-0">
        <DesktopSidebar
          activeSection={desktopSection}
          income={income}
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

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:px-6 lg:py-5 xl:px-8">
            <HouseholdScopeSelector
              households={households}
              onChange={(householdId) => {
                closeTransactionEditor();
                setSelectedHouseholdId(householdId);
              }}
              selectedHouseholdId={selectedHouseholdId}
            />
            <WorkspaceError
              error={error}
              isLoading={isLoadingData}
              onRetry={retryLoad}
            />
            {isLoadingData && visibleSection !== "assistant" ? (
              <SectionSkeleton />
            ) : (
              <WorkspaceSection
                section={visibleSection}
                {...{
                  accessToken: session.accessToken,
                  allowHouseholdReportScope:
                    selectedHousehold?.kind === "Family",
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
                  onDashboardMonthChange: (month) =>
                    void changeDashboardMonth(month),
                  onCloseEdit: closeTransactionEditor,
                  onCreateHousehold: handleCreateHousehold,
                  onSaveHouseholdSettings: handleSaveHouseholdSettings,
                  onEditFormChange: setEditForm,
                  onHouseholdNameChange: setHouseholdName,
                  onMemberEmailChange: setMemberEmail,
                  onMemberRoleChange: setMemberRole,
                  onInvitationResponse: (invitationId, response) =>
                    void handleInvitationResponse(invitationId, response),
                  onDeleteTransaction: (transaction) =>
                    void handleDeleteTransaction(transaction),
                  onRestoreTransaction: (transaction) =>
                    void handleRestoreTransaction(transaction),
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
                  onTransactionMonthChange: (month) =>
                    void changeTransactionMonth(month),
                  onTransactionPageChange: (page) =>
                    void changeTransactionPage(page),
                  selectedHouseholdId,
                  selectedTransaction,
                  settingsForm,
                  text,
                  transactionMonth,
                  transactionPage,
                  transactions,
                  householdName,
                }}
              />
            )}
          </div>

          <MobileBottomNav
            activeSection={mobileSection}
            onMore={() => setMobileMenuOpen(true)}
          />
        </section>
      </div>

      <MobileMenu
        activeSection={mobileSection}
        onClose={() => setMobileMenuOpen(false)}
        onSignOut={signOut}
        open={mobileMenuOpen}
        sessionEmail={session.user.email}
        sessionName={session.user.displayName}
      />

      {undoTransaction ? (
        <div
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white shadow-xl"
          role="status"
        >
          Moved to Recently Deleted.
          <button
            className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 font-bold"
            onClick={() => void handleRestoreTransaction(undoTransaction)}
            type="button"
          >
            <RotateCcw className="h-4 w-4" /> Undo
          </button>
          <button
            aria-label="Dismiss undo"
            onClick={() => setUndoTransaction(null)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {isDesktop && desktopSection !== "assistant" ? (
        <DesktopAssistantDock
          chatEndRef={chatEndRef}
          inputMode={inputMode}
          isListening={isListening}
          isOpen={desktopAssistantOpen}
          isSubmitting={isSubmitting}
          messages={messages}
          onClose={() => updateQuery({}, "")}
          onOpen={() => updateQuery({}, "assistant")}
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
