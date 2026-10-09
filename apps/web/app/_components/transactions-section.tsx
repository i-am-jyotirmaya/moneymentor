"use client";
import { SectionSkeleton } from "./loading-ui";
import { CategoryPicker } from "./category-picker";
import { Dropdown } from "./dropdown";

import { listFinancialAccounts } from "@/lib/api";
import type {
  CategoryCatalogResponse,
  FinancialAccount, TransactionKind, PaymentChannel,
  TransactionListItem,
  TransactionPageResponse,
  TransactionVisibility,
} from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type TransactionEditForm } from "../_hooks/use-transaction-state";
import {
  EmptyInline,
  Field,
  MonthNavigator,
  TransactionRow,
} from "./common-ui";
import { formatDate, formatMoney, formatMonthKey } from "./workspace-format";

export function TransactionsSection({
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
            <h2 className="text-2xl font-semibold tracking-normal">
              Transactions
            </h2>
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

        <div
          className={`mt-5 divide-y divide-[var(--border)] ${isLoading ? "opacity-60" : ""}`}
        >
          {isLoading ? (
            <SectionSkeleton rows={3} />
          ) : transactions.length > 0 ? (
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
            <EmptyInline
              text={`No transactions found in ${formatMonthKey(month)}.`}
            />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <p
            className="text-sm font-medium text-[var(--muted)]"
            aria-live="polite"
          >
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
            <h3 id="recently-deleted" className="text-lg font-semibold">
              Recently deleted
            </h3>
            <p className="mt-1 text-sm font-medium text-[var(--muted)]">
              Items remain restorable for 30 days.
            </p>
          </div>
          <Trash2 className="h-5 w-5 text-[var(--muted)]" />
        </div>
        <div className="mt-4 divide-y divide-[var(--border)]">
          {deletedTransactions.length > 0 ? (
            deletedTransactions.map((transaction) => (
              <div
                className="flex items-center justify-between gap-3 py-3"
                key={transaction.id}
              >
                <div>
                  <p className="text-sm font-semibold">
                    {transaction.reason ??
                      transaction.description ??
                      transaction.categoryName ??
                      "Transaction"}
                  </p>
                  <p className="text-xs font-medium text-[var(--muted)]">
                    {formatMoney(transaction.amount, transaction.currencyCode)}{" "}
                    · purge{" "}
                    {transaction.purgeAfter
                      ? formatDate(transaction.purgeAfter)
                      : "in 30 days"}
                  </p>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-45"
                  disabled={!canWrite}
                  onClick={() => onRestoreTransaction(transaction)}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4" /> Restore
                </button>
              </div>
            ))
          ) : (
            <EmptyInline text="Trash is empty." />
          )}
        </div>
      </article>
    </section>
  );
}

export function TransactionEditModal({
  accessToken,
  categoryCatalog,
  editForm,
  isSaving,
  onClose,
  onEditFormChange,
  onSave,
  transaction,
}: {
  accessToken: string;
  categoryCatalog: CategoryCatalogResponse | null;
  editForm: TransactionEditForm;
  isSaving: boolean;
  onClose: () => void;
  onEditFormChange: (form: TransactionEditForm) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  transaction: TransactionListItem;
}) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listFinancialAccounts(accessToken, transaction.householdId).then(rows => { if (!cancelled) setAccounts(rows); })
      .catch(error => { if (!cancelled) setAccountError(error instanceof Error ? error.message : "Unable to load accounts."); });
    return () => { cancelled = true; };
  }, [accessToken, transaction.householdId]);
  const isTransfer = ["Transfer", "CreditCardPayment", "CashWithdrawal"].includes(editForm.kind);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const isIncome = ["Income", "Cashback"].includes(editForm.kind);

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
            <h3 className="text-lg font-semibold" id="transaction-editor-title">
              Edit transaction
            </h3>
            <p
              className="mt-1 text-sm font-medium text-[var(--muted)]"
              id="transaction-editor-description"
            >
              Last edited by {transaction.updatedByDisplayName ?? "Spndrr"}
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
          <Dropdown label="Financial event" value={editForm.kind} disabled={isSaving || !!transaction.relatedTransactionId || ["Refund", "Reversal"].includes(editForm.kind)}
            options={["Purchase", "Income", "Transfer", "CreditCardPayment", "Cashback", "Fee", "Interest", "CashWithdrawal", "Investment", ...(editForm.kind === "Refund" || editForm.kind === "Reversal" ? [editForm.kind] : [])].map(value => ({ value, label: value.replace(/([a-z])([A-Z])/g, "$1 $2") }))}
            onChange={value => onEditFormChange({ ...editForm, kind: value as TransactionKind, categoryId: null, categoryName: "", counterpartyAccountId: null })} />
          <Dropdown label={isTransfer ? "Source account (optional)" : "Account (optional)"} value={editForm.accountId ?? ""} disabled={isSaving || !!accountError}
            options={[{ value: "", label: "Unspecified" }, ...accounts.filter(x => x.isActive || x.id === editForm.accountId).map(x => ({ value: x.id, label: x.name }))]}
            searchable onChange={value => onEditFormChange({ ...editForm, accountId: value || null })} />
          {isTransfer && <Dropdown label="Destination account (optional)" value={editForm.counterpartyAccountId ?? ""} disabled={isSaving || !!accountError}
            options={[{ value: "", label: "Unspecified" }, ...accounts.filter(x => (x.isActive || x.id === editForm.counterpartyAccountId) && x.id !== editForm.accountId).map(x => ({ value: x.id, label: x.name }))]}
            searchable onChange={value => onEditFormChange({ ...editForm, counterpartyAccountId: value || null })} />}
          {accountError && <p role="alert" className="text-sm text-red-700">{accountError}</p>}
          <Dropdown label="Payment channel (optional)" value={editForm.paymentChannel} disabled={isSaving}
            options={["Unknown", "UPI", "Card", "Cash", "BankTransfer", "AutoDebit", "Wallet", "Cheque"].map(value => ({ value, label: value.replace(/([a-z])([A-Z])/g, "$1 $2") }))}
            onChange={value => onEditFormChange({ ...editForm, paymentChannel: value as PaymentChannel })} />
          <Field label="Amount">
            <input
              className="form-control"
              min="0.01"
              onChange={(event) =>
                onEditFormChange({ ...editForm, amount: event.target.value })
              }
              required
              step="0.01"
              type="number"
              value={editForm.amount}
            />
          </Field>
          <CategoryPicker
            categories={categoryCatalog?.categories ?? []}
            categoryId={editForm.categoryId}
            categoryName={editForm.categoryName}
            disabled={isSaving || !categoryCatalog || !!transaction.relatedTransactionId || isTransfer}
            onChange={(category) => onEditFormChange({
              ...editForm,
              categoryId: category.id,
              categoryName: category.name,
            })}
            type={isIncome ? "Income" : "Expense"}
          />
          {isIncome ? (
            <>
              <Field label="Sender">
                <input
                  className="form-control"
                  onChange={(event) =>
                    onEditFormChange({
                      ...editForm,
                      senderName: event.target.value,
                    })
                  }
                  value={editForm.senderName}
                />
              </Field>
              <Field label="Reason">
                <input
                  className="form-control"
                  onChange={(event) =>
                    onEditFormChange({
                      ...editForm,
                      reason: event.target.value,
                    })
                  }
                  value={editForm.reason}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Merchant">
                <input
                  className="form-control"
                  onChange={(event) =>
                    onEditFormChange({
                      ...editForm,
                      merchantName: event.target.value,
                    })
                  }
                  value={editForm.merchantName}
                />
              </Field>
              <Field label="Description">
                <input
                  className="form-control"
                  onChange={(event) =>
                    onEditFormChange({
                      ...editForm,
                      description: event.target.value,
                    })
                  }
                  value={editForm.description}
                />
              </Field>
            </>
          )}
          <Field label="Transaction date">
            <input
              className="form-control"
              onChange={(event) =>
                onEditFormChange({
                  ...editForm,
                  transactionDate: event.target.value,
                })
              }
              required
              type="date"
              value={editForm.transactionDate}
            />
          </Field>
          <Dropdown
            disabled={isSaving}
            label="Visibility"
            onChange={(value) => onEditFormChange({
              ...editForm,
              visibility: value as TransactionVisibility,
            })}
            options={[
              { value: "Private", label: "Private" },
              { value: "Household", label: "Household" },
            ]}
            value={editForm.visibility}
          />
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
