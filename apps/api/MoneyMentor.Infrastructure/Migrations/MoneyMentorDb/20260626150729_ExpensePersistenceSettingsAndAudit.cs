using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class ExpensePersistenceSettingsAndAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultTransactionVisibility",
                schema: "app",
                table: "user_profiles",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Private");

            migrationBuilder.AddColumn<string>(
                name: "Plan",
                schema: "app",
                table: "user_profiles",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Free");

            migrationBuilder.AddColumn<bool>(
                name: "RequireMerchantForExpenses",
                schema: "app",
                table: "user_profiles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "UpdatedByUserProfileId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                schema: "app",
                table: "households",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Family");

            migrationBuilder.CreateTable(
                name: "transaction_audit_entries",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TransactionId = table.Column<Guid>(type: "uuid", nullable: false),
                    EditedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    EditedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ChangedFieldsJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_transaction_audit_entries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_transaction_audit_entries_transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "app",
                        principalTable: "transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_transaction_audit_entries_user_profiles_EditedByUserProfile~",
                        column: x => x.EditedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_transactions_UpdatedByUserProfileId",
                schema: "app",
                table: "transactions",
                column: "UpdatedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_transaction_audit_entries_EditedAt",
                schema: "app",
                table: "transaction_audit_entries",
                column: "EditedAt");

            migrationBuilder.CreateIndex(
                name: "IX_transaction_audit_entries_EditedByUserProfileId",
                schema: "app",
                table: "transaction_audit_entries",
                column: "EditedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_transaction_audit_entries_TransactionId",
                schema: "app",
                table: "transaction_audit_entries",
                column: "TransactionId");

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_user_profiles_UpdatedByUserProfileId",
                schema: "app",
                table: "transactions",
                column: "UpdatedByUserProfileId",
                principalSchema: "app",
                principalTable: "user_profiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_transactions_user_profiles_UpdatedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropTable(
                name: "transaction_audit_entries",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_transactions_UpdatedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "DefaultTransactionVisibility",
                schema: "app",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "Plan",
                schema: "app",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "RequireMerchantForExpenses",
                schema: "app",
                table: "user_profiles");

            migrationBuilder.DropColumn(
                name: "UpdatedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "Kind",
                schema: "app",
                table: "households");
        }
    }
}
