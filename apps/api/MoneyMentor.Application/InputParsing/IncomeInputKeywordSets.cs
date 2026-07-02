namespace MoneyMentor.Application.InputParsing;

internal static class IncomeInputKeywordSets
{
    public static readonly IReadOnlySet<string> IncomeSignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "salary",
        "income",
        "received",
        "receive",
        "credited",
        "bonus",
        "got paid",
        "freelance payment",
        "payment received",
        "sent me",
        "gave me",
        "paid me",
        "transferred me",
        "mujhe mila",
        "mujhe mili",
        "mujhe mile",
        "mujhe diye",
        "ne mujhe");

    public static readonly IReadOnlySet<string> SalarySignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "salary", "paycheck", "pay cheque", "wages", "tankhwa", "tankha");

    public static readonly IReadOnlySet<string> BonusSignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "bonus", "incentive");

    public static readonly IReadOnlySet<string> FreelanceSignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "freelance", "freelancing", "client payment", "consulting");

    public static readonly IReadOnlySet<string> RefundSignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "refund", "reimbursement", "cashback");

    public static readonly IReadOnlySet<string> GiftSignals = ExpenseInputKeywordSets.CreateKeywordSet(
        "gift", "shagun");
}
