using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class AddJudgementDeduplicationKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Period_RuleCode",
                schema: "app",
                table: "judgements");

            migrationBuilder.AddColumn<string>(
                name: "DeduplicationKey",
                schema: "app",
                table: "judgements",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                UPDATE app.judgements
                SET "DeduplicationKey" = LEFT(
                    CASE "RuleCode"
                        WHEN 'SAVINGS_RATE_LOW' THEN 'cashflow'
                        WHEN 'NEGATIVE_CASHFLOW' THEN 'cashflow'
                        WHEN 'DISCRETIONARY_HIGH' THEN 'discretionary'
                        WHEN 'GOAL_CONFLICT' THEN 'household-goals'
                        WHEN 'CATEGORY_SPIKE' THEN 'category:' || LOWER(COALESCE("InputsJson"->>'category', "Value", 'unknown'))
                        WHEN 'GOAL_OFF_TRACK' THEN 'goal:' || LOWER(COALESCE("InputsJson"->>'goalId', "Value", 'unknown'))
                        WHEN 'COMMITMENT_MISSED' THEN 'commitment:' || LOWER(COALESCE("InputsJson"->>'commitmentId', "Value", 'unknown'))
                        ELSE LOWER("RuleCode")
                    END,
                    128
                )
                WHERE "DeduplicationKey" = '';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Period_RuleCode_Dedupl~",
                schema: "app",
                table: "judgements",
                columns: new[] { "HouseholdId", "UserProfileId", "Period", "RuleCode", "DeduplicationKey" },
                unique: true,
                filter: "\"DismissedAt\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Period_RuleCode_Dedupl~",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "DeduplicationKey",
                schema: "app",
                table: "judgements");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Period_RuleCode",
                schema: "app",
                table: "judgements",
                columns: new[] { "HouseholdId", "UserProfileId", "Period", "RuleCode" },
                unique: true,
                filter: "\"DismissedAt\" IS NULL");
        }
    }
}
