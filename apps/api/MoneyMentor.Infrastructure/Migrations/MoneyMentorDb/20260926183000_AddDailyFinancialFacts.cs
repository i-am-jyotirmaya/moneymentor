using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MoneyMentor.Infrastructure.Persistence;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb;

[DbContext(typeof(MoneyMentorDbContext))]
[Migration("20260926183000_AddDailyFinancialFacts")]
public sealed class AddDailyFinancialFacts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE app.daily_financial_aggregates (
                "Id" uuid PRIMARY KEY, "HouseholdId" uuid NOT NULL REFERENCES app.households("Id") ON DELETE CASCADE,
                "UserProfileId" uuid NULL REFERENCES app.user_profiles("Id") ON DELETE SET NULL,
                "Date" date NOT NULL, "Visibility" varchar(32) NOT NULL,
                "CategoryId" uuid NULL REFERENCES app.categories("Id") ON DELETE SET NULL,
                "Income" numeric(18,2) NOT NULL, "Expense" numeric(18,2) NOT NULL,
                "EssentialSpend" numeric(18,2) NOT NULL, "DiscretionarySpend" numeric(18,2) NOT NULL,
                "DebtSpend" numeric(18,2) NOT NULL, "InvestmentAmount" numeric(18,2) NOT NULL,
                "TransactionCount" integer NOT NULL, "ExpenseTransactionCount" integer NOT NULL,
                "IncomeTransactionCount" integer NOT NULL, "AverageTransactionAmount" numeric(18,2) NOT NULL,
                "MaximumTransactionAmount" numeric(18,2) NOT NULL, "CalculationVersion" varchar(32) NOT NULL,
                "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL
            );
            CREATE UNIQUE INDEX "IX_daily_financial_aggregates_grain"
                ON app.daily_financial_aggregates ("HouseholdId", "UserProfileId", "Date", "Visibility", "CategoryId") NULLS NOT DISTINCT;
            CREATE INDEX "IX_daily_financial_aggregates_household_date_category"
                ON app.daily_financial_aggregates ("HouseholdId", "Date", "CategoryId");
            INSERT INTO app.daily_financial_aggregates
                ("Id", "HouseholdId", "UserProfileId", "Date", "Visibility", "CategoryId",
                 "Income", "Expense", "EssentialSpend", "DiscretionarySpend", "DebtSpend",
                 "InvestmentAmount", "TransactionCount", "ExpenseTransactionCount", "IncomeTransactionCount",
                 "AverageTransactionAmount", "MaximumTransactionAmount", "CalculationVersion", "CreatedAt", "UpdatedAt")
            SELECT gen_random_uuid(), t."HouseholdId", t."UserProfileId", t."TransactionDate", t."Visibility", t."CategoryId",
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Income'), 0),
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Expense'), 0),
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Expense' AND c."Classification" = 'Essential'), 0),
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Expense' AND c."Classification" = 'Discretionary'), 0),
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Expense' AND c."Classification" = 'Debt'), 0),
                   coalesce(sum(t."Amount") FILTER (WHERE t."Type" = 'Investment' OR
                       t."Type" = 'Expense' AND c."Classification" = 'Savings'), 0),
                   count(*), count(*) FILTER (WHERE t."Type" = 'Expense'),
                   count(*) FILTER (WHERE t."Type" = 'Income'),
                   round(avg(t."Amount"), 2), max(t."Amount"), 'v1', now(), now()
            FROM app.transactions t
            LEFT JOIN app.categories c ON c."Id" = t."CategoryId"
            WHERE t."DeletedAt" IS NULL
            GROUP BY t."HouseholdId", t."UserProfileId", t."TransactionDate", t."Visibility", t."CategoryId";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("DROP TABLE app.daily_financial_aggregates;");
}
