using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Infrastructure.Categories;

internal static class SystemCategoryCatalog
{
    public static readonly IReadOnlyCollection<SystemCategoryDefinition> Definitions =
    [
        Group("Income", CategoryType.Income, CategoryClassification.Income, 10, "wallet"),
        Leaf("Salary / Wages", "Income", CategoryType.Income, CategoryClassification.Income, 11, ["salary", "wage", "paycheck"]),
        Leaf("Bonus / Commission", "Income", CategoryType.Income, CategoryClassification.Income, 12, ["bonus", "commission", "incentive"]),
        Leaf("Freelance / Self-Employment", "Income", CategoryType.Income, CategoryClassification.Income, 13, ["freelance", "client", "consulting"]),
        Leaf("Refunds / Reimbursements", "Income", CategoryType.Income, CategoryClassification.Income, 14, ["refund", "reimbursement", "cashback"]),
        Leaf("Other Income", "Income", CategoryType.Income, CategoryClassification.Income, 19, ["income"]),

        Group("Housing", CategoryType.Expense, CategoryClassification.Essential, 100, "home"),
        Leaf("Rent", "Housing", CategoryType.Expense, CategoryClassification.Essential, 101, ["rent"]),
        Leaf("Mortgage", "Housing", CategoryType.Expense, CategoryClassification.Essential, 102, ["mortgage", "home loan"]),
        Leaf("Repairs & Maintenance", "Housing", CategoryType.Expense, CategoryClassification.Essential, 103, ["repair", "maintenance"]),
        Leaf("Furniture & Appliances", "Housing", CategoryType.Expense, CategoryClassification.Discretionary, 104, ["furniture", "appliance"]),

        Group("Utilities", CategoryType.Expense, CategoryClassification.Essential, 200, "zap"),
        Leaf("Electricity", "Utilities", CategoryType.Expense, CategoryClassification.Essential, 201, ["electricity", "power"]),
        Leaf("Internet", "Utilities", CategoryType.Expense, CategoryClassification.Essential, 202, ["internet", "wifi", "broadband"]),
        Leaf("Mobile / Phone", "Utilities", CategoryType.Expense, CategoryClassification.Essential, 203, ["mobile", "phone", "recharge"]),
        Leaf("Water & Sewer", "Utilities", CategoryType.Expense, CategoryClassification.Essential, 204, ["water"]),

        Group("Food & Groceries", CategoryType.Expense, CategoryClassification.Essential, 300, "shopping-basket"),
        Leaf("Groceries", "Food & Groceries", CategoryType.Expense, CategoryClassification.Essential, 301, ["groceries", "sabzi", "doodh", "zepto", "blinkit"]),
        Leaf("Household Supplies", "Food & Groceries", CategoryType.Expense, CategoryClassification.Essential, 302, ["household supplies"]),

        Group("Dining & Lifestyle", CategoryType.Expense, CategoryClassification.Discretionary, 400, "utensils"),
        Leaf("Restaurants", "Dining & Lifestyle", CategoryType.Expense, CategoryClassification.Discretionary, 401, ["restaurant", "dinner", "lunch"]),
        Leaf("Cafes / Coffee", "Dining & Lifestyle", CategoryType.Expense, CategoryClassification.Discretionary, 402, ["coffee", "cafe"]),
        Leaf("Food Delivery", "Dining & Lifestyle", CategoryType.Expense, CategoryClassification.Discretionary, 403, ["swiggy", "zomato", "takeout"]),
        Leaf("Bars / Alcohol", "Dining & Lifestyle", CategoryType.Expense, CategoryClassification.Discretionary, 404, ["bar", "alcohol"]),

        Group("Transportation", CategoryType.Expense, CategoryClassification.Essential, 500, "car"),
        Leaf("Fuel", "Transportation", CategoryType.Expense, CategoryClassification.Essential, 501, ["fuel", "petrol", "diesel"]),
        Leaf("Public Transit", "Transportation", CategoryType.Expense, CategoryClassification.Essential, 502, ["metro", "bus", "train"]),
        Leaf("Ride-Sharing / Taxi", "Transportation", CategoryType.Expense, CategoryClassification.Essential, 503, ["taxi", "uber", "ola", "rapido"]),
        Leaf("Car Maintenance & Repairs", "Transportation", CategoryType.Expense, CategoryClassification.Essential, 504, ["car service", "vehicle repair"]),

        Group("Health & Medical", CategoryType.Expense, CategoryClassification.Essential, 600, "heart-pulse"),
        Leaf("Health Insurance", "Health & Medical", CategoryType.Expense, CategoryClassification.Essential, 601, ["health insurance", "medical insurance"]),
        Leaf("Doctor / Consultation", "Health & Medical", CategoryType.Expense, CategoryClassification.Essential, 602, ["doctor", "consultation"]),
        Leaf("Pharmacy / Medication", "Health & Medical", CategoryType.Expense, CategoryClassification.Essential, 603, ["medicine", "pharmacy"]),

        Group("Shopping", CategoryType.Expense, CategoryClassification.Discretionary, 700, "shopping-bag"),
        Leaf("Clothing & Apparel", "Shopping", CategoryType.Expense, CategoryClassification.Discretionary, 701, ["clothes", "clothing"]),
        Leaf("Electronics & Gadgets", "Shopping", CategoryType.Expense, CategoryClassification.Discretionary, 702, ["electronics", "gadget"]),
        Leaf("General Merchandise", "Shopping", CategoryType.Expense, CategoryClassification.Discretionary, 703, ["shopping", "amazon", "flipkart"]),

        Group("Entertainment", CategoryType.Expense, CategoryClassification.Discretionary, 800, "sparkles"),
        Leaf("Streaming Subscriptions", "Entertainment", CategoryType.Expense, CategoryClassification.Discretionary, 801, ["netflix", "spotify", "prime"]),
        Leaf("Movies / Events / Concerts", "Entertainment", CategoryType.Expense, CategoryClassification.Discretionary, 802, ["movie", "concert", "event"]),
        Leaf("Gaming", "Entertainment", CategoryType.Expense, CategoryClassification.Discretionary, 803, ["gaming", "game"]),

        Group("Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 900, "chart-line"),
        Leaf("Emergency Fund", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 901, ["emergency fund"]),
        Leaf("General Savings", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 902, ["saving"]),
        Leaf("Retirement Contributions", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 903, ["retirement", "pf", "nps"]),
        Leaf("Mutual Funds / ETFs", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 904, ["mutual fund", "sip", "etf"]),
        Leaf("Brokerage / Stocks", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 905, ["stock", "brokerage"]),
        Leaf("Crypto", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 906, ["crypto"]),
        Leaf("Goal Contributions", "Savings & Investments", CategoryType.Expense, CategoryClassification.Savings, 907, ["goal contribution"]),

        Group("Debt & Loans", CategoryType.Expense, CategoryClassification.Debt, 1000, "credit-card"),
        Leaf("Credit Card Payment", "Debt & Loans", CategoryType.Expense, CategoryClassification.Debt, 1001, ["credit card payment"]),
        Leaf("Personal Loan", "Debt & Loans", CategoryType.Expense, CategoryClassification.Debt, 1002, ["personal loan"]),
        Leaf("Student Loan", "Debt & Loans", CategoryType.Expense, CategoryClassification.Debt, 1003, ["student loan"]),
        Leaf("Loan Interest", "Debt & Loans", CategoryType.Expense, CategoryClassification.Debt, 1004, ["interest"]),

        Group("Financial & Fees", CategoryType.Expense, CategoryClassification.Essential, 1100, "receipt"),
        Leaf("Taxes", "Financial & Fees", CategoryType.Expense, CategoryClassification.Essential, 1101, ["tax", "gst"]),
        Leaf("Bank Fees", "Financial & Fees", CategoryType.Expense, CategoryClassification.Essential, 1102, ["bank fee", "atm fee"]),
        Leaf("Late Fees / Penalties", "Financial & Fees", CategoryType.Expense, CategoryClassification.Essential, 1103, ["late fee", "penalty"]),

        Group("Miscellaneous", CategoryType.Expense, CategoryClassification.Discretionary, 1200, "circle-help"),
        Leaf("Miscellaneous / Uncategorized", "Miscellaneous", CategoryType.Expense, CategoryClassification.Discretionary, 1201, ["misc", "uncategorized"])
    ];

    public static SystemCategoryDefinition? FindByName(string? name, CategoryType type)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return Definitions.FirstOrDefault(definition =>
            !definition.IsGroup
            && definition.Type == type
            && string.Equals(definition.Name, name.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public static CategoryClassification GetFallbackClassification(CategoryType type) =>
        type == CategoryType.Income
            ? CategoryClassification.Income
            : CategoryClassification.Discretionary;

    private static SystemCategoryDefinition Group(
        string name,
        CategoryType type,
        CategoryClassification classification,
        int sortOrder,
        string icon) =>
        new(name, null, type, classification, sortOrder, icon, [], true);

    private static SystemCategoryDefinition Leaf(
        string name,
        string parentName,
        CategoryType type,
        CategoryClassification classification,
        int sortOrder,
        IReadOnlyCollection<string> keywords) =>
        new(name, parentName, type, classification, sortOrder, null, keywords, false);
}

internal sealed record SystemCategoryDefinition(
    string Name,
    string? ParentName,
    CategoryType Type,
    CategoryClassification Classification,
    int SortOrder,
    string? Icon,
    IReadOnlyCollection<string> Keywords,
    bool IsGroup);
