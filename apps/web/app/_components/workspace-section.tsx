"use client";
import dynamic from "next/dynamic";
import { SectionSkeleton } from "./loading-ui";

import { AssistantSection } from "./assistant-section";
import { DashboardSection } from "./dashboard-section";
const HouseholdSection = dynamic(
  () => import("./household-section").then((module) => module.HouseholdSection),
  { loading: () => <SectionSkeleton /> },
);
const JudgementReportsPanel = dynamic(
  () =>
    import("./judgement-reports-panel").then(
      (module) => module.JudgementReportsPanel,
    ),
  { loading: () => <SectionSkeleton /> },
);
const PlanningSection = dynamic(
  () => import("./planning-section").then((module) => module.PlanningSection),
  { loading: () => <SectionSkeleton /> },
);
const SettingsSection = dynamic(
  () => import("./settings-section").then((module) => module.SettingsSection),
  { loading: () => <SectionSkeleton /> },
);
import { TransactionsSection } from "./transactions-section";
import { AppSection, SectionRenderProps } from "./workspace-types";

export function WorkspaceSection({
  section,
  ...props
}: SectionRenderProps & { section: Exclude<AppSection, "home"> }) {
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
        imagePreview={props.imagePreview} onImage={props.onImage} onConfirmImage={props.onConfirmImage} onEditImage={props.onEditImage} onDismissImage={props.onDismissImage}
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
