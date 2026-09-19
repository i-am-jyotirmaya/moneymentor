"use client";

import type {
TransactionListItem,
TransactionPageResponse,
TransactionVisibility,
} from "@/lib/api";
import { useState } from "react";

export type TransactionEditForm = {
  amount: string;
  categoryName: string;
  merchantName: string;
  description: string;
  senderName: string;
  reason: string;
  transactionDate: string;
  visibility: TransactionVisibility;
};

export function useTransactionState(initialMonth: string) {
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [transactionPage, setTransactionPage] =
    useState<TransactionPageResponse | null>(null);
  const [transactionMonth, setTransactionMonth] = useState(initialMonth);
  const [editForm, setEditForm] = useState<TransactionEditForm | null>(null);
  const [deletedTransactions, setDeletedTransactions] = useState<
    TransactionListItem[]
  >([]);
  const [undoTransaction, setUndoTransaction] =
    useState<TransactionListItem | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

  return {
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
    setIsLoadingTransactions,
    isSavingTransaction,
    setIsSavingTransaction,
  };
}
