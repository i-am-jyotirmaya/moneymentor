using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class AccountAwareTransactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AccountId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CounterpartyAccountId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalReference",
                schema: "app",
                table: "transactions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                schema: "app",
                table: "transactions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ObservationAccountId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentChannel",
                schema: "app",
                table: "transactions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReversedKind",
                schema: "app",
                table: "transactions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "financial_accounts",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    AccountType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Institution = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Last4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    CurrencyCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    MetadataJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_financial_accounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_financial_accounts_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_financial_accounts_user_profiles_OwnerUserProfileId",
                        column: x => x.OwnerUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "transaction_relations",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TransactionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelatedTransactionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelationType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    Confidence = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_transaction_relations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_transaction_relations_transactions_RelatedTransactionId",
                        column: x => x.RelatedTransactionId,
                        principalSchema: "app",
                        principalTable: "transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_transaction_relations_transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "app",
                        principalTable: "transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "financial_account_aliases",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FinancialAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Alias = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_financial_account_aliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_financial_account_aliases_financial_accounts_FinancialAccou~",
                        column: x => x.FinancialAccountId,
                        principalSchema: "app",
                        principalTable: "financial_accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_transactions_AccountId",
                schema: "app",
                table: "transactions",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_CounterpartyAccountId",
                schema: "app",
                table: "transactions",
                column: "CounterpartyAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_HouseholdId_ObservationAccountId_ExternalRefer~",
                schema: "app",
                table: "transactions",
                columns: new[] { "HouseholdId", "ObservationAccountId", "ExternalReference" },
                unique: true,
                filter: "\"ExternalReference\" IS NOT NULL AND \"ObservationAccountId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_ObservationAccountId",
                schema: "app",
                table: "transactions",
                column: "ObservationAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_financial_account_aliases_FinancialAccountId_Alias",
                schema: "app",
                table: "financial_account_aliases",
                columns: new[] { "FinancialAccountId", "Alias" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_financial_accounts_HouseholdId",
                schema: "app",
                table: "financial_accounts",
                column: "HouseholdId");

            migrationBuilder.CreateIndex(
                name: "IX_financial_accounts_OwnerUserProfileId",
                schema: "app",
                table: "financial_accounts",
                column: "OwnerUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_transaction_relations_RelatedTransactionId",
                schema: "app",
                table: "transaction_relations",
                column: "RelatedTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_transaction_relations_TransactionId_RelatedTransactionId_Re~",
                schema: "app",
                table: "transaction_relations",
                columns: new[] { "TransactionId", "RelatedTransactionId", "RelationType" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_financial_accounts_AccountId",
                schema: "app",
                table: "transactions",
                column: "AccountId",
                principalSchema: "app",
                principalTable: "financial_accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_financial_accounts_CounterpartyAccountId",
                schema: "app",
                table: "transactions",
                column: "CounterpartyAccountId",
                principalSchema: "app",
                principalTable: "financial_accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_financial_accounts_ObservationAccountId",
                schema: "app",
                table: "transactions",
                column: "ObservationAccountId",
                principalSchema: "app",
                principalTable: "financial_accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
            migrationBuilder.Sql("""
                UPDATE app.transactions SET "Kind" = CASE "Type"
                    WHEN 'Expense' THEN 'Purchase' WHEN 'Income' THEN 'Income'
                    WHEN 'Investment' THEN 'Investment' ELSE 'Transfer' END
                WHERE "Kind" IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_transactions_financial_accounts_AccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropForeignKey(
                name: "FK_transactions_financial_accounts_CounterpartyAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropForeignKey(
                name: "FK_transactions_financial_accounts_ObservationAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropTable(
                name: "financial_account_aliases",
                schema: "app");

            migrationBuilder.DropTable(
                name: "transaction_relations",
                schema: "app");

            migrationBuilder.DropTable(
                name: "financial_accounts",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_transactions_AccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_CounterpartyAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_HouseholdId_ObservationAccountId_ExternalRefer~",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_ObservationAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "AccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "CounterpartyAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "ExternalReference",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "Kind",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "ObservationAccountId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "PaymentChannel",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "ReversedKind",
                schema: "app",
                table: "transactions");
        }
    }
}
