using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class CompleteGoalPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid?>(
                name: "CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE app.financial_goals AS goal
                SET "CreatedByUserProfileId" = COALESCE(
                    goal."UserProfileId",
                    (
                        SELECT member."UserProfileId"
                        FROM app.household_members AS member
                        WHERE member."HouseholdId" = goal."HouseholdId"
                          AND member."Status" = 'Active'
                        ORDER BY
                            CASE member."Role"
                                WHEN 'Owner' THEN 0
                                WHEN 'Admin' THEN 1
                                WHEN 'Member' THEN 2
                                ELSE 3
                            END,
                            member."JoinedAt",
                            member."UserProfileId"
                        LIMIT 1
                    )
                );

                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM app.financial_goals
                        WHERE "CreatedByUserProfileId" IS NULL
                    ) THEN
                        RAISE EXCEPTION
                            'Cannot assign creators to legacy shared goals without an active household member';
                    END IF;
                END $$;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "goal_plan_participant_consents",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    PolicyVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ConsentedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_plan_participant_consents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_plan_participant_consents_financial_goals_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "app",
                        principalTable: "financial_goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goal_plan_participant_consents_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "goal_plans",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActiveVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    LastActivationIdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_plans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_plans_financial_goals_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "app",
                        principalTable: "financial_goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goal_plans_user_profiles_CreatedByUserProfileId",
                        column: x => x.CreatedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "goal_plan_versions",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    Source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UserContext = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_plan_versions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_plan_versions_goal_plan_versions_SourceVersionId",
                        column: x => x.SourceVersionId,
                        principalSchema: "app",
                        principalTable: "goal_plan_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_goal_plan_versions_goal_plans_GoalPlanId",
                        column: x => x.GoalPlanId,
                        principalSchema: "app",
                        principalTable: "goal_plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goal_plan_versions_user_profiles_CreatedByUserProfileId",
                        column: x => x.CreatedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "goal_plan_options",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalPlanVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Pace = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    MonthlyContribution = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ProjectedCompletionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Feasibility = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsRecommended = table.Column<bool>(type: "boolean", nullable: false),
                    Title = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Explanation = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    TradeOffsJson = table.Column<string>(type: "jsonb", nullable: false),
                    AssumptionsJson = table.Column<string>(type: "jsonb", nullable: false),
                    RisksJson = table.Column<string>(type: "jsonb", nullable: false),
                    MilestonesJson = table.Column<string>(type: "jsonb", nullable: false),
                    CalculationVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_plan_options", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_plan_options_goal_plan_versions_GoalPlanVersionId",
                        column: x => x.GoalPlanVersionId,
                        principalSchema: "app",
                        principalTable: "goal_plan_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "goal_planning_runs",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GoalId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResultVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    RunType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RequestJson = table.Column<string>(type: "jsonb", nullable: false),
                    SnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    Model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PromptVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SchemaVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: false),
                    OutputTokens = table.Column<int>(type: "integer", nullable: false),
                    RetryCount = table.Column<int>(type: "integer", nullable: false),
                    FailureCategory = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Error = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_goal_planning_runs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_goal_planning_runs_financial_goals_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "app",
                        principalTable: "financial_goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_goal_planning_runs_goal_plan_versions_SourceVersionId",
                        column: x => x.SourceVersionId,
                        principalSchema: "app",
                        principalTable: "goal_plan_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_goal_planning_runs_user_profiles_RequestedByUserProfileId",
                        column: x => x.RequestedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_financial_goals_CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals",
                column: "CreatedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_options_GoalPlanVersionId_SortOrder",
                schema: "app",
                table: "goal_plan_options",
                columns: new[] { "GoalPlanVersionId", "SortOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_participant_consents_GoalId_UserProfileId",
                schema: "app",
                table: "goal_plan_participant_consents",
                columns: new[] { "GoalId", "UserProfileId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_participant_consents_UserProfileId",
                schema: "app",
                table: "goal_plan_participant_consents",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_versions_CreatedByUserProfileId",
                schema: "app",
                table: "goal_plan_versions",
                column: "CreatedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_versions_GoalPlanId_VersionNumber",
                schema: "app",
                table: "goal_plan_versions",
                columns: new[] { "GoalPlanId", "VersionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_goal_plan_versions_SourceVersionId",
                schema: "app",
                table: "goal_plan_versions",
                column: "SourceVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_planning_runs_GoalId",
                schema: "app",
                table: "goal_planning_runs",
                column: "GoalId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_planning_runs_RequestedByUserProfileId_IdempotencyKey",
                schema: "app",
                table: "goal_planning_runs",
                columns: new[] { "RequestedByUserProfileId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_goal_planning_runs_SourceVersionId",
                schema: "app",
                table: "goal_planning_runs",
                column: "SourceVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_planning_runs_Status_CreatedAt",
                schema: "app",
                table: "goal_planning_runs",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_goal_plans_CreatedByUserProfileId",
                schema: "app",
                table: "goal_plans",
                column: "CreatedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_plans_GoalId",
                schema: "app",
                table: "goal_plans",
                column: "GoalId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_financial_goals_user_profiles_CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals",
                column: "CreatedByUserProfileId",
                principalSchema: "app",
                principalTable: "user_profiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_financial_goals_user_profiles_CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals");

            migrationBuilder.DropTable(
                name: "goal_plan_options",
                schema: "app");

            migrationBuilder.DropTable(
                name: "goal_plan_participant_consents",
                schema: "app");

            migrationBuilder.DropTable(
                name: "goal_planning_runs",
                schema: "app");

            migrationBuilder.DropTable(
                name: "goal_plan_versions",
                schema: "app");

            migrationBuilder.DropTable(
                name: "goal_plans",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_financial_goals_CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals");

            migrationBuilder.DropColumn(
                name: "CreatedByUserProfileId",
                schema: "app",
                table: "financial_goals");
        }
    }
}
