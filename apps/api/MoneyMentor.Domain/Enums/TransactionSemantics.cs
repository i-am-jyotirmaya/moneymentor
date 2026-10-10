namespace MoneyMentor.Domain.Enums;

public enum TransactionKind { Purchase, Refund, Income, Transfer, CreditCardPayment, Reversal, Cashback, Fee, Interest, CashWithdrawal, Investment }
public enum FinancialAccountType { BankAccount, CreditCard, Cash, Wallet }
public enum PaymentChannel { UPI, Card, Cash, BankTransfer, AutoDebit, Wallet, Cheque, Unknown }
public enum TransactionRelationType { RefundOf, ReversalOf, CorrectionOf, TransferPair }
