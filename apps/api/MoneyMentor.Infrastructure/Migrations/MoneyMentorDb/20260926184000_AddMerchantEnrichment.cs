using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MoneyMentor.Infrastructure.Persistence;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb;

[DbContext(typeof(MoneyMentorDbContext))]
[Migration("20260926184000_AddMerchantEnrichment")]
public sealed class AddMerchantEnrichment : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE app.merchants (
                "Id" uuid PRIMARY KEY, "HouseholdId" uuid NOT NULL REFERENCES app.households("Id") ON DELETE CASCADE,
                "CanonicalName" varchar(256) NOT NULL, "NormalizedName" varchar(256) NOT NULL,
                "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL
            );
            CREATE UNIQUE INDEX "IX_merchants_household_normalized" ON app.merchants ("HouseholdId", "NormalizedName");
            CREATE TABLE app.merchant_aliases (
                "Id" uuid PRIMARY KEY, "MerchantId" uuid NOT NULL REFERENCES app.merchants("Id") ON DELETE CASCADE,
                "Alias" varchar(256) NOT NULL, "NormalizedAlias" varchar(256) NOT NULL,
                "Source" varchar(32) NOT NULL, "Confidence" numeric(5,4) NOT NULL
            );
            CREATE UNIQUE INDEX "IX_merchant_aliases_merchant_normalized"
                ON app.merchant_aliases ("MerchantId", "NormalizedAlias");
            CREATE INDEX "IX_merchant_aliases_normalized" ON app.merchant_aliases ("NormalizedAlias");
            ALTER TABLE app.transactions ADD COLUMN "MerchantId" uuid NULL REFERENCES app.merchants("Id") ON DELETE SET NULL;
            ALTER TABLE app.transactions ADD COLUMN "EnrichmentJson" jsonb NULL;
            CREATE INDEX "IX_transactions_merchant" ON app.transactions ("MerchantId");

            INSERT INTO app.merchants ("Id", "HouseholdId", "CanonicalName", "NormalizedName", "CreatedAt", "UpdatedAt")
            SELECT gen_random_uuid(), "HouseholdId", min(trim("MerchantName")),
                   left(lower(trim(regexp_replace("MerchantName", '\s+', ' ', 'g'))), 256), now(), now()
            FROM app.transactions
            WHERE "Type" = 'Expense' AND "MerchantName" IS NOT NULL AND trim("MerchantName") <> ''
            GROUP BY "HouseholdId", left(lower(trim(regexp_replace("MerchantName", '\s+', ' ', 'g'))), 256);
            UPDATE app.transactions t SET "MerchantId" = m."Id"
            FROM app.merchants m
            WHERE t."Type" = 'Expense' AND t."HouseholdId" = m."HouseholdId"
              AND left(lower(trim(regexp_replace(t."MerchantName", '\s+', ' ', 'g'))), 256) = m."NormalizedName";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE app.transactions DROP COLUMN "MerchantId";
            ALTER TABLE app.transactions DROP COLUMN "EnrichmentJson";
            DROP TABLE app.merchant_aliases;
            DROP TABLE app.merchants;
            """);
    }
}
