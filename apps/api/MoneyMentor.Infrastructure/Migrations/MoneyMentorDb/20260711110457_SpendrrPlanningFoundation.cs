using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class SpendrrPlanningFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_categories_HouseholdId",
                schema: "app",
                table: "categories");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AchievedAt",
                schema: "app",
                table: "financial_goals",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GoalType",
                schema: "app",
                table: "financial_goals",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Saving");

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlyTarget",
                schema: "app",
                table: "financial_goals",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Classification",
                schema: "app",
                table: "categories",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Discretionary");

            migrationBuilder.AddColumn<string>(
                name: "Icon",
                schema: "app",
                table: "categories",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsHidden",
                schema: "app",
                table: "categories",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                schema: "app",
                table: "categories",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "commitments",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    GoalId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    TransactionType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Cadence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NextDueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LastMatchedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastJudgementAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_commitments", x => x.Id);
                    table.CheckConstraint("CK_commitments_supported_transaction_type", "\"TransactionType\" IN ('Expense', 'Investment')");
                    table.ForeignKey(
                        name: "FK_commitments_categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "app",
                        principalTable: "categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_commitments_financial_goals_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "app",
                        principalTable: "financial_goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_commitments_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_commitments_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "judgement_rules",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    HouseholdScope = table.Column<bool>(type: "boolean", nullable: false),
                    ParamsJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgement_rules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "judgements",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SubjectType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Period = table.Column<DateOnly>(type: "date", nullable: false),
                    Severity = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Tone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Title = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Value = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Message = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    InputsJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    DismissedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DismissedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_judgements_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_judgements_user_profiles_DismissedByUserProfileId",
                        column: x => x.DismissedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_judgements_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "goal_contributions",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ContributedAt = table.Column<DateOnly>(type: "date", nullable: false),
                    Source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TransactionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CommitmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_contributions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_contributions_commitments_CommitmentId",
                        column: x => x.CommitmentId,
                        principalSchema: "app",
                        principalTable: "commitments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_goal_contributions_financial_goals_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "app",
                        principalTable: "financial_goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goal_contributions_transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "app",
                        principalTable: "transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_goal_contributions_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_categories_HouseholdId_ParentCategoryId_Name",
                schema: "app",
                table: "categories",
                columns: new[] { "HouseholdId", "ParentCategoryId", "Name" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_categories_no_self_parent",
                schema: "app",
                table: "categories",
                sql: "\"ParentCategoryId\" IS NULL OR \"ParentCategoryId\" <> \"Id\"");

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION app.enforce_category_parent_is_root()
                RETURNS trigger AS $$
                BEGIN
                    IF NEW."ParentCategoryId" IS NOT NULL THEN
                        IF EXISTS (
                            SELECT 1
                            FROM app.categories parent
                            WHERE parent."Id" = NEW."ParentCategoryId"
                              AND parent."ParentCategoryId" IS NOT NULL
                        ) THEN
                            RAISE EXCEPTION 'Parent category must be a top-level category';
                        END IF;
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_categories_parent_is_root"
                BEFORE INSERT OR UPDATE ON app.categories
                FOR EACH ROW EXECUTE FUNCTION app.enforce_category_parent_is_root();
                """);

            migrationBuilder.CreateIndex(
                name: "IX_commitments_CategoryId",
                schema: "app",
                table: "commitments",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_commitments_GoalId",
                schema: "app",
                table: "commitments",
                column: "GoalId");

            migrationBuilder.CreateIndex(
                name: "IX_commitments_HouseholdId_IsActive_NextDueDate",
                schema: "app",
                table: "commitments",
                columns: new[] { "HouseholdId", "IsActive", "NextDueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_commitments_UserProfileId",
                schema: "app",
                table: "commitments",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_contributions_CommitmentId",
                schema: "app",
                table: "goal_contributions",
                column: "CommitmentId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_contributions_GoalId_ContributedAt",
                schema: "app",
                table: "goal_contributions",
                columns: new[] { "GoalId", "ContributedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_goal_contributions_TransactionId",
                schema: "app",
                table: "goal_contributions",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_contributions_UserProfileId",
                schema: "app",
                table: "goal_contributions",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_rules_Code",
                schema: "app",
                table: "judgement_rules",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_judgements_DismissedByUserProfileId",
                schema: "app",
                table: "judgements",
                column: "DismissedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Period_RuleCode",
                schema: "app",
                table: "judgements",
                columns: new[] { "HouseholdId", "UserProfileId", "Period", "RuleCode" },
                unique: true,
                filter: "\"DismissedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_SubjectType_SubjectId_Period",
                schema: "app",
                table: "judgements",
                columns: new[] { "SubjectType", "SubjectId", "Period" });

            migrationBuilder.CreateIndex(
                name: "IX_judgements_UserProfileId",
                schema: "app",
                table: "judgements",
                column: "UserProfileId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "goal_contributions",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgement_rules",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgements",
                schema: "app");

            migrationBuilder.DropTable(
                name: "commitments",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_categories_HouseholdId_ParentCategoryId_Name",
                schema: "app",
                table: "categories");

            migrationBuilder.DropCheckConstraint(
                name: "CK_categories_no_self_parent",
                schema: "app",
                table: "categories");

            migrationBuilder.Sql(
                """
                DROP TRIGGER IF EXISTS "TR_categories_parent_is_root" ON app.categories;
                DROP FUNCTION IF EXISTS app.enforce_category_parent_is_root();
                """);

            migrationBuilder.DropColumn(
                name: "AchievedAt",
                schema: "app",
                table: "financial_goals");

            migrationBuilder.DropColumn(
                name: "GoalType",
                schema: "app",
                table: "financial_goals");

            migrationBuilder.DropColumn(
                name: "MonthlyTarget",
                schema: "app",
                table: "financial_goals");

            migrationBuilder.DropColumn(
                name: "Classification",
                schema: "app",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "Icon",
                schema: "app",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "IsHidden",
                schema: "app",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                schema: "app",
                table: "categories");

            migrationBuilder.CreateIndex(
                name: "IX_categories_HouseholdId",
                schema: "app",
                table: "categories",
                column: "HouseholdId");
        }
    }
}
