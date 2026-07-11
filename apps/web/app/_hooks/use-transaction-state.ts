"use client";

import { useState } from "react";
import type {
  TransactionListItem,
  TransactionPageResponse,
  TransactionVisibility,
} from "@/lib/api";

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
  const [transactionPage, setTransactionPage] = useState<TransactionPageResponse | null>(null);
  const [transactionMonth, setTransactionMonth] = useState(initialMonth);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionEditForm | null>(null);
  const [deletedTransactions, setDeletedTransactions] = useState<TransactionListItem[]>([]);
  const [undoTransaction, setUndoTransaction] = useState<TransactionListItem | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

  return {
    transactions,
    setTransactions,
    transactionPage,
    setTransactionPage,
    transactionMonth,
    setTransactionMonth,
    selectedTransactionId,
    setSelectedTransactionId,
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
