namespace MoneyMentor.Application.InputParsing;

internal static class ExpenseMerchantKeywordCatalog
{
    public static readonly ExpenseMerchantKeywordRule[] Rules =
    [
        new("Zepto", ExpenseInputKeywordSets.CreateKeywordSet("zepto"), "Groceries"),
        new("Swiggy", ExpenseInputKeywordSets.CreateKeywordSet("swiggy"), "Food Delivery"),
        new("Zomato", ExpenseInputKeywordSets.CreateKeywordSet("zomato"), "Food Delivery"),
        new("Amazon", ExpenseInputKeywordSets.CreateKeywordSet("amazon"), "Shopping"),
        new("Flipkart", ExpenseInputKeywordSets.CreateKeywordSet("flipkart"), "Shopping"),
        new("Blinkit", ExpenseInputKeywordSets.CreateKeywordSet("blinkit"), "Groceries"),
        new("BigBasket", ExpenseInputKeywordSets.CreateKeywordSet("bigbasket", "big basket"), "Groceries"),
        new("DMart", ExpenseInputKeywordSets.CreateKeywordSet("dmart", "d mart"), "Groceries"),
        new("Myntra", ExpenseInputKeywordSets.CreateKeywordSet("myntra"), "Shopping"),
        new("Ajio", ExpenseInputKeywordSets.CreateKeywordSet("ajio"), "Shopping"),
        new("Uber", ExpenseInputKeywordSets.CreateKeywordSet("uber"), "Transport"),
        new("Ola", ExpenseInputKeywordSets.CreateKeywordSet("ola"), "Transport"),
        new("Netflix", ExpenseInputKeywordSets.CreateKeywordSet("netflix"), "Entertainment"),
        new("Spotify", ExpenseInputKeywordSets.CreateKeywordSet("spotify"), "Entertainment"),
        new("Hotstar", ExpenseInputKeywordSets.CreateKeywordSet("hotstar"), "Entertainment"),
        new("Jio", ExpenseInputKeywordSets.CreateKeywordSet("jio"), "Utilities"),
        new("Airtel", ExpenseInputKeywordSets.CreateKeywordSet("airtel"), "Utilities"),
        new("Vi", ExpenseInputKeywordSets.CreateKeywordSet("vi"), "Utilities"),
        new("Reliance Fresh", ExpenseInputKeywordSets.CreateKeywordSet("reliance fresh"), "Groceries"),
        new("Local Market", ExpenseInputKeywordSets.CreateKeywordSet("local market"), "Groceries"),
        new("Starbucks", ExpenseInputKeywordSets.CreateKeywordSet("starbucks"), "Dining"),
        new("Dominos", ExpenseInputKeywordSets.CreateKeywordSet("dominos", "domino's"), "Dining"),
        new("Pizza Hut", ExpenseInputKeywordSets.CreateKeywordSet("pizza hut"), "Dining"),
        new("McDonald's", ExpenseInputKeywordSets.CreateKeywordSet("mcdonalds", "mcdonald's"), "Dining"),
        new("KFC", ExpenseInputKeywordSets.CreateKeywordSet("kfc"), "Dining")
    ];
}

internal sealed record ExpenseMerchantKeywordRule(
    string DisplayName,
    IReadOnlySet<string> Keywords,
    string? ImpliedCategory);
