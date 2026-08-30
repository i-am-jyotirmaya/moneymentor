using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class ExternalBetaReadiness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_transactions_user_profiles_UserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_TransactionDate",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_households_CreatedByUserProfileId",
                schema: "app",
                table: "households");

            migrationBuilder.DropIndex(
                name: "IX_household_invitations_HouseholdId_Email",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserProfileId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.Sql(
                """
                ALTER TABLE app.transactions
                ALTER COLUMN "TransactionDate" TYPE date
                USING ("TransactionDate" AT TIME ZONE 'UTC')::date;
                """);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "app",
                table: "transactions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeletedByUserProfileId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PurgeAfter",
                schema: "app",
                table: "transactions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryAttemptCount",
                schema: "app",
                table: "household_invitations",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryId",
                schema: "app",
                table: "household_invitations",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeliveryLeaseUntil",
                schema: "app",
                table: "household_invitations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryStatus",
                schema: "app",
                table: "household_invitations",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unknown");

            migrationBuilder.Sql(
                """
                UPDATE app.user_profiles
                SET "TimeZone" = 'Asia/Kolkata'
                WHERE lower("TimeZone") = 'asia/calcutta';
                """);

            migrationBuilder.AddColumn<string>(
                name: "LastDeliveryError",
                schema: "app",
                table: "household_invitations",
                type: "character varying(1024)",
                maxLength: 1024,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "NextDeliveryAttemptAt",
                schema: "app",
                table: "household_invitations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderMessageId",
                schema: "app",
                table: "household_invitations",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SentAt",
                schema: "app",
                table: "household_invitations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "entitlement_changes",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousPlan = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NewPlan = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Operator = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Reason = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_entitlement_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_entitlement_changes_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "privacy_consents",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    PolicyVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_privacy_consents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_privacy_consents_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_transactions_DeletedByUserProfileId",
                schema: "app",
                table: "transactions",
                column: "DeletedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_HouseholdId_TransactionDate",
                schema: "app",
                table: "transactions",
                columns: new[] { "HouseholdId", "TransactionDate" },
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_transactions_PurgeAfter",
                schema: "app",
                table: "transactions",
                column: "PurgeAfter",
                filter: "\"DeletedAt\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_households_CreatedByUserProfileId",
                schema: "app",
                table: "households",
                column: "CreatedByUserProfileId",
                unique: true,
                filter: "\"Kind\" = 'Personal'");

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_DeliveryId",
                schema: "app",
                table: "household_invitations",
                column: "DeliveryId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_DeliveryStatus_NextDeliveryAttemptAt",
                schema: "app",
                table: "household_invitations",
                columns: new[] { "DeliveryStatus", "NextDeliveryAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_HouseholdId_Email",
                schema: "app",
                table: "household_invitations",
                columns: new[] { "HouseholdId", "Email" },
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_entitlement_changes_UserProfileId_ChangedAt",
                schema: "app",
                table: "entitlement_changes",
                columns: new[] { "UserProfileId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_privacy_consents_UserProfileId_PolicyVersion",
                schema: "app",
                table: "privacy_consents",
                columns: new[] { "UserProfileId", "PolicyVersion" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_user_profiles_DeletedByUserProfileId",
                schema: "app",
                table: "transactions",
                column: "DeletedByUserProfileId",
                principalSchema: "app",
                principalTable: "user_profiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_user_profiles_UserProfileId",
                schema: "app",
                table: "transactions",
                column: "UserProfileId",
                principalSchema: "app",
                principalTable: "user_profiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_transactions_user_profiles_DeletedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropForeignKey(
                name: "FK_transactions_user_profiles_UserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropTable(
                name: "entitlement_changes",
                schema: "app");

            migrationBuilder.DropTable(
                name: "privacy_consents",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_transactions_DeletedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_HouseholdId_TransactionDate",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_transactions_PurgeAfter",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropIndex(
                name: "IX_households_CreatedByUserProfileId",
                schema: "app",
                table: "households");

            migrationBuilder.DropIndex(
                name: "IX_household_invitations_DeliveryId",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropIndex(
                name: "IX_household_invitations_DeliveryStatus_NextDeliveryAttemptAt",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropIndex(
                name: "IX_household_invitations_HouseholdId_Email",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "DeletedByUserProfileId",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "PurgeAfter",
                schema: "app",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "DeliveryAttemptCount",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "DeliveryId",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "DeliveryLeaseUntil",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "DeliveryStatus",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "LastDeliveryError",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "NextDeliveryAttemptAt",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "ProviderMessageId",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.DropColumn(
                name: "SentAt",
                schema: "app",
                table: "household_invitations");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserProfileId",
                schema: "app",
                table: "transactions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.Sql(
                """
                ALTER TABLE app.transactions
                ALTER COLUMN "TransactionDate" TYPE timestamp with time zone
                USING "TransactionDate"::timestamp AT TIME ZONE 'UTC';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_transactions_TransactionDate",
                schema: "app",
                table: "transactions",
                column: "TransactionDate");

            migrationBuilder.CreateIndex(
                name: "IX_households_CreatedByUserProfileId",
                schema: "app",
                table: "households",
                column: "CreatedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_HouseholdId_Email",
                schema: "app",
                table: "household_invitations",
                columns: new[] { "HouseholdId", "Email" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_transactions_user_profiles_UserProfileId",
                schema: "app",
                table: "transactions",
                column: "UserProfileId",
                principalSchema: "app",
                principalTable: "user_profiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
