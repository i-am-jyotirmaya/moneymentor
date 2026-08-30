using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class WeeklyMonthlyFinancialJudgements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_judgement_rules_Code",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.AddColumn<string>(
                name: "ActionCode",
                schema: "app",
                table: "judgements",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ActionParametersJson",
                schema: "app",
                table: "judgements",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "Cadence",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Monthly");

            migrationBuilder.AddColumn<string>(
                name: "CalculationVersion",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "v1");

            migrationBuilder.AddColumn<string>(
                name: "Direction",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Neutral");

            migrationBuilder.AddColumn<string>(
                name: "EvidenceJson",
                schema: "app",
                table: "judgements",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExpiresAt",
                schema: "app",
                table: "judgements",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<string>(
                name: "FocusMetric",
                schema: "app",
                table: "judgements",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "IssueKey",
                schema: "app",
                table: "judgements",
                type: "character varying(256)",
                maxLength: 256,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ResolvedAt",
                schema: "app",
                table: "judgements",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ResolvingSummaryId",
                schema: "app",
                table: "judgements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RuleVersion",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "v1");

            migrationBuilder.AddColumn<string>(
                name: "Scope",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Personal");

            migrationBuilder.AddColumn<int>(
                name: "SeverityRank",
                schema: "app",
                table: "judgements",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "SpendingSummaryId",
                schema: "app",
                table: "judgements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "app",
                table: "judgements",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Superseded");

            migrationBuilder.AddColumn<string>(
                name: "SubjectKey",
                schema: "app",
                table: "judgements",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SupersededAt",
                schema: "app",
                table: "judgements",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupersededByJudgementId",
                schema: "app",
                table: "judgements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupersedesJudgementId",
                schema: "app",
                table: "judgements",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThresholdsJson",
                schema: "app",
                table: "judgements",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "Cadence",
                schema: "app",
                table: "judgement_rules",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Monthly");

            migrationBuilder.AddColumn<string>(
                name: "RuleVersion",
                schema: "app",
                table: "judgement_rules",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "v1");

            migrationBuilder.AddColumn<string>(
                name: "Scope",
                schema: "app",
                table: "judgement_rules",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Personal");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                schema: "app",
                table: "judgement_rules",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                schema: "app",
                table: "households",
                type: "character(3)",
                fixedLength: true,
                maxLength: 3,
                nullable: false,
                defaultValue: "INR");

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                schema: "app",
                table: "households",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "Asia/Kolkata");

            migrationBuilder.Sql("""
                UPDATE app.households AS household
                SET "CurrencyCode" = COALESCE(NULLIF(profile."CurrencyCode", ''), 'INR'),
                    "TimeZone" = COALESCE(NULLIF(profile."TimeZone", ''), 'Asia/Kolkata')
                FROM app.user_profiles AS profile
                WHERE profile."Id" = household."CreatedByUserProfileId";

                UPDATE app.judgement_rules
                SET "IsActive" = FALSE,
                    "Cadence" = 'Monthly',
                    "Scope" = 'Personal',
                    "RuleVersion" = 'legacy-v1',
                    "UpdatedAt" = now();

                INSERT INTO app.judgement_rules
                    ("Id", "Code", "Category", "Severity", "IsActive", "HouseholdScope",
                     "Cadence", "Scope", "RuleVersion", "ParamsJson", "CreatedAt", "UpdatedAt")
                SELECT md5(rule."Code" || cadence."Cadence" || scope."Scope")::uuid,
                       rule."Code", rule."Category", 'Info', TRUE,
                       scope."Scope" = 'Household', cadence."Cadence", scope."Scope", 'v1', '{}'::jsonb, now(), now()
                FROM (VALUES
                    ('CASHFLOW_SAVINGS', 'Cashflow'),
                    ('CONSUMPTION_CHANGE', 'Spending'),
                    ('INCOME_CHANGE', 'Cashflow'),
                    ('DISCRETIONARY_SHARE', 'Spending'),
                    ('CATEGORY_CHANGE', 'Spending'),
                    ('UNCATEGORIZED_DATA', 'Spending'),
                    ('GOAL_CAPACITY', 'Goals'),
                    ('GOAL_PACE', 'Goals'),
                    ('COMMITMENT_MISSED', 'Recurring')
                ) AS rule("Code", "Category")
                CROSS JOIN (VALUES ('Weekly'), ('Monthly')) AS cadence("Cadence")
                CROSS JOIN (VALUES ('Personal'), ('Household')) AS scope("Scope");

                ALTER TABLE app.households ALTER COLUMN "CurrencyCode" DROP DEFAULT;
                ALTER TABLE app.households ALTER COLUMN "TimeZone" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "ActionParametersJson" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "Cadence" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "CalculationVersion" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "Direction" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "EvidenceJson" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "ExpiresAt" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "RuleVersion" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "Scope" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "Status" DROP DEFAULT;
                ALTER TABLE app.judgements ALTER COLUMN "ThresholdsJson" DROP DEFAULT;
                ALTER TABLE app.judgement_rules ALTER COLUMN "Cadence" DROP DEFAULT;
                ALTER TABLE app.judgement_rules ALTER COLUMN "RuleVersion" DROP DEFAULT;
                ALTER TABLE app.judgement_rules ALTER COLUMN "Scope" DROP DEFAULT;
                """);

            migrationBuilder.CreateTable(
                name: "commitment_occurrences",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CommitmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    MatchedTransactionId = table.Column<Guid>(type: "uuid", nullable: true),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExpectedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TransactionType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    MatchedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EvaluatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_commitment_occurrences", x => x.Id);
                    table.CheckConstraint("CK_commitment_occurrences_expected_amount", "\"ExpectedAmount\" >= 0");
                    table.ForeignKey(
                        name: "FK_commitment_occurrences_commitments_CommitmentId",
                        column: x => x.CommitmentId,
                        principalSchema: "app",
                        principalTable: "commitments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_commitment_occurrences_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_commitment_occurrences_transactions_MatchedTransactionId",
                        column: x => x.MatchedTransactionId,
                        principalSchema: "app",
                        principalTable: "transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_commitment_occurrences_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "judgement_schedules",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Cadence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NextPeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    NextDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastEnqueuedPeriodStart = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgement_schedules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_judgement_schedules_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_judgement_schedules_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "judgement_user_states",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    JudgementId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DismissedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SnoozedUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgement_user_states", x => x.Id);
                    table.ForeignKey(
                        name: "FK_judgement_user_states_judgements_JudgementId",
                        column: x => x.JudgementId,
                        principalSchema: "app",
                        principalTable: "judgements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_judgement_user_states_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql("""
                INSERT INTO app.judgement_user_states
                    ("Id", "JudgementId", "UserProfileId", "DismissedAt", "CreatedAt", "UpdatedAt")
                SELECT md5(judgement."Id"::text || judgement."DismissedByUserProfileId"::text)::uuid,
                       judgement."Id", judgement."DismissedByUserProfileId", judgement."DismissedAt",
                       COALESCE(judgement."DismissedAt", now()), now()
                FROM app.judgements AS judgement
                WHERE judgement."DismissedByUserProfileId" IS NOT NULL
                  AND judgement."DismissedAt" IS NOT NULL;
                """);

            migrationBuilder.CreateTable(
                name: "spending_summaries",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Cadence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    WindowStart = table.Column<DateOnly>(type: "date", nullable: false),
                    WindowEndExclusive = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrencyCode = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    CalculationVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Direction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Confidence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Income = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ExplicitSavings = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ConsumptionSpend = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EssentialSpend = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscretionarySpend = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DebtSpend = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UncategorizedSpend = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CashOutflow = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    OperatingSurplus = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CashBalance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SavingsRate = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    SavingsAllocationRate = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    ExpenseToIncomeRate = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    EssentialShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    DiscretionaryShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    DebtShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    UncategorizedShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    TransactionCount = table.Column<int>(type: "integer", nullable: false),
                    ExpenseTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    IncomeTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    InvestmentTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    TransferTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    CategorizedTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    UncategorizedTransactionCount = table.Column<int>(type: "integer", nullable: false),
                    ActiveTransactionDays = table.Column<int>(type: "integer", nullable: false),
                    FirstTransactionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    LastTransactionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PreviousSummaryId = table.Column<Guid>(type: "uuid", nullable: true),
                    BaselinePeriodCount = table.Column<int>(type: "integer", nullable: false),
                    RequiredBaselinePeriodCount = table.Column<int>(type: "integer", nullable: false),
                    MetricsComparisonJson = table.Column<string>(type: "jsonb", nullable: false),
                    DataQualityFlagsJson = table.Column<string>(type: "jsonb", nullable: false),
                    GoalInputsJson = table.Column<string>(type: "jsonb", nullable: false),
                    RuleVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NarrationStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NarrationHeadline = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NarrationOverview = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    NarrationJson = table.Column<string>(type: "jsonb", nullable: true),
                    NarrationModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsDeterministicFallback = table.Column<bool>(type: "boolean", nullable: false),
                    CalculatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    NarratedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spending_summaries", x => x.Id);
                    table.CheckConstraint("CK_spending_summaries_revision", "\"Revision\" > 0");
                    table.CheckConstraint("CK_spending_summaries_window", "\"WindowEndExclusive\" > \"WindowStart\"");
                    table.ForeignKey(
                        name: "FK_spending_summaries_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_spending_summaries_spending_summaries_PreviousSummaryId",
                        column: x => x.PreviousSummaryId,
                        principalSchema: "app",
                        principalTable: "spending_summaries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_spending_summaries_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "judgement_work_items",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    SpendingSummaryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Cadence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Stage = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodEndExclusive = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrencyCode = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RequestedGeneration = table.Column<long>(type: "bigint", nullable: false),
                    ProcessedGeneration = table.Column<long>(type: "bigint", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ClaimToken = table.Column<Guid>(type: "uuid", nullable: true),
                    ClaimedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LeaseExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    MaxAttempts = table.Column<int>(type: "integer", nullable: false),
                    FailureCategory = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    LastError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DeadLetteredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgement_work_items", x => x.Id);
                    table.CheckConstraint("CK_judgement_work_items_attempts", "\"AttemptCount\" >= 0 AND \"MaxAttempts\" > 0");
                    table.CheckConstraint("CK_judgement_work_items_generations", "\"RequestedGeneration\" >= \"ProcessedGeneration\" AND \"ProcessedGeneration\" >= 0");
                    table.CheckConstraint("CK_judgement_work_items_window", "\"PeriodEndExclusive\" > \"PeriodStart\"");
                    table.ForeignKey(
                        name: "FK_judgement_work_items_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_judgement_work_items_spending_summaries_SpendingSummaryId",
                        column: x => x.SpendingSummaryId,
                        principalSchema: "app",
                        principalTable: "spending_summaries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_judgement_work_items_user_profiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "spending_summary_categories",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SpendingSummaryId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    ParentCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    CategoryNameSnapshot = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ParentCategoryNameSnapshot = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ClassificationSnapshot = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Share = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    TransactionCount = table.Column<int>(type: "integer", nullable: false),
                    PreviousAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PreviousDeltaAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PreviousDeltaPercent = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    PreviousTrend = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    BaselineAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    BaselineDeltaAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    BaselineDeltaPercent = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    BaselineTrend = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PreviousShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    PreviousShareDeltaPoints = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    BaselineShare = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    BaselineShareDeltaPoints = table.Column<decimal>(type: "numeric(20,8)", precision: 20, scale: 8, nullable: true),
                    IsNew = table.Column<bool>(type: "boolean", nullable: false),
                    IsStopped = table.Column<bool>(type: "boolean", nullable: false),
                    IsMaterial = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_spending_summary_categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_spending_summary_categories_categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "app",
                        principalTable: "categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_spending_summary_categories_categories_ParentCategoryId",
                        column: x => x.ParentCategoryId,
                        principalSchema: "app",
                        principalTable: "categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_spending_summary_categories_spending_summaries_SpendingSumm~",
                        column: x => x.SpendingSummaryId,
                        principalSchema: "app",
                        principalTable: "spending_summaries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "judgement_evaluation_runs",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SpendingSummaryId = table.Column<Guid>(type: "uuid", nullable: false),
                    JudgementWorkItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    Stage = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    AttemptNumber = table.Column<int>(type: "integer", nullable: false),
                    Succeeded = table.Column<bool>(type: "boolean", nullable: false),
                    CalculationVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RuleVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    NarrationSchemaVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    DeterministicInputJson = table.Column<string>(type: "jsonb", nullable: false),
                    NarrationOutputJson = table.Column<string>(type: "jsonb", nullable: true),
                    Provider = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Model = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    InputTokens = table.Column<int>(type: "integer", nullable: false),
                    OutputTokens = table.Column<int>(type: "integer", nullable: false),
                    DurationMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    FailureCategory = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Error = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_judgement_evaluation_runs", x => x.Id);
                    table.CheckConstraint("CK_judgement_evaluation_runs_attempt", "\"AttemptNumber\" > 0");
                    table.CheckConstraint("CK_judgement_evaluation_runs_usage", "\"InputTokens\" >= 0 AND \"OutputTokens\" >= 0 AND \"DurationMilliseconds\" >= 0");
                    table.ForeignKey(
                        name: "FK_judgement_evaluation_runs_judgement_work_items_JudgementWor~",
                        column: x => x.JudgementWorkItemId,
                        principalSchema: "app",
                        principalTable: "judgement_work_items",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_judgement_evaluation_runs_spending_summaries_SpendingSummar~",
                        column: x => x.SpendingSummaryId,
                        principalSchema: "app",
                        principalTable: "spending_summaries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Scope_Cadence_Status_E~",
                schema: "app",
                table: "judgements",
                columns: new[] { "HouseholdId", "UserProfileId", "Scope", "Cadence", "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_judgements_ResolvingSummaryId",
                schema: "app",
                table: "judgements",
                column: "ResolvingSummaryId");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_SpendingSummaryId_IssueKey",
                schema: "app",
                table: "judgements",
                columns: new[] { "SpendingSummaryId", "IssueKey" },
                unique: true,
                filter: "\"SpendingSummaryId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_SupersededByJudgementId",
                schema: "app",
                table: "judgements",
                column: "SupersededByJudgementId");

            migrationBuilder.CreateIndex(
                name: "IX_judgements_SupersedesJudgementId",
                schema: "app",
                table: "judgements",
                column: "SupersedesJudgementId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_rules_Code_Cadence_Scope_RuleVersion",
                schema: "app",
                table: "judgement_rules",
                columns: new[] { "Code", "Cadence", "Scope", "RuleVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_commitment_occurrences_CommitmentId_DueDate",
                schema: "app",
                table: "commitment_occurrences",
                columns: new[] { "CommitmentId", "DueDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_commitment_occurrences_HouseholdId_Status_DueDate",
                schema: "app",
                table: "commitment_occurrences",
                columns: new[] { "HouseholdId", "Status", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_commitment_occurrences_MatchedTransactionId",
                schema: "app",
                table: "commitment_occurrences",
                column: "MatchedTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_commitment_occurrences_UserProfileId",
                schema: "app",
                table: "commitment_occurrences",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_evaluation_runs_JudgementWorkItemId",
                schema: "app",
                table: "judgement_evaluation_runs",
                column: "JudgementWorkItemId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_evaluation_runs_SpendingSummaryId_Stage_AttemptNu~",
                schema: "app",
                table: "judgement_evaluation_runs",
                columns: new[] { "SpendingSummaryId", "Stage", "AttemptNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_judgement_evaluation_runs_Stage_StartedAt",
                schema: "app",
                table: "judgement_evaluation_runs",
                columns: new[] { "Stage", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_judgement_schedules_HouseholdId_Scope_Cadence",
                schema: "app",
                table: "judgement_schedules",
                columns: new[] { "HouseholdId", "Scope", "Cadence" },
                unique: true,
                filter: "\"UserProfileId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_schedules_HouseholdId_UserProfileId_Scope_Cadence",
                schema: "app",
                table: "judgement_schedules",
                columns: new[] { "HouseholdId", "UserProfileId", "Scope", "Cadence" },
                unique: true,
                filter: "\"UserProfileId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_schedules_IsActive_NextDueAt",
                schema: "app",
                table: "judgement_schedules",
                columns: new[] { "IsActive", "NextDueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_judgement_schedules_UserProfileId",
                schema: "app",
                table: "judgement_schedules",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_user_states_JudgementId_UserProfileId",
                schema: "app",
                table: "judgement_user_states",
                columns: new[] { "JudgementId", "UserProfileId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_judgement_user_states_UserProfileId_DismissedAt_SnoozedUntil",
                schema: "app",
                table: "judgement_user_states",
                columns: new[] { "UserProfileId", "DismissedAt", "SnoozedUntil" });

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_ClaimToken",
                schema: "app",
                table: "judgement_work_items",
                column: "ClaimToken",
                filter: "\"ClaimToken\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_HouseholdId_Scope_Cadence_PeriodStart_~",
                schema: "app",
                table: "judgement_work_items",
                columns: new[] { "HouseholdId", "Scope", "Cadence", "PeriodStart", "Stage" },
                unique: true,
                filter: "\"UserProfileId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_HouseholdId_UserProfileId_Scope_Cadenc~",
                schema: "app",
                table: "judgement_work_items",
                columns: new[] { "HouseholdId", "UserProfileId", "Scope", "Cadence", "PeriodStart", "Stage" },
                unique: true,
                filter: "\"UserProfileId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_SpendingSummaryId",
                schema: "app",
                table: "judgement_work_items",
                column: "SpendingSummaryId");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_Stage_Status_AvailableAt_LeaseExpiresAt",
                schema: "app",
                table: "judgement_work_items",
                columns: new[] { "Stage", "Status", "AvailableAt", "LeaseExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_judgement_work_items_UserProfileId",
                schema: "app",
                table: "judgement_work_items",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summaries_HouseholdId_Scope_Cadence_WindowStart_Re~",
                schema: "app",
                table: "spending_summaries",
                columns: new[] { "HouseholdId", "Scope", "Cadence", "WindowStart", "Revision" },
                unique: true,
                filter: "\"UserProfileId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summaries_HouseholdId_Status_PublishedAt",
                schema: "app",
                table: "spending_summaries",
                columns: new[] { "HouseholdId", "Status", "PublishedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_spending_summaries_HouseholdId_UserProfileId_Scope_Cadence_~",
                schema: "app",
                table: "spending_summaries",
                columns: new[] { "HouseholdId", "UserProfileId", "Scope", "Cadence", "WindowStart", "Revision" },
                unique: true,
                filter: "\"UserProfileId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summaries_PreviousSummaryId",
                schema: "app",
                table: "spending_summaries",
                column: "PreviousSummaryId");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summaries_UserProfileId",
                schema: "app",
                table: "spending_summaries",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summary_categories_CategoryId",
                schema: "app",
                table: "spending_summary_categories",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summary_categories_ParentCategoryId",
                schema: "app",
                table: "spending_summary_categories",
                column: "ParentCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_spending_summary_categories_SpendingSummaryId_SubjectKey",
                schema: "app",
                table: "spending_summary_categories",
                columns: new[] { "SpendingSummaryId", "SubjectKey" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_judgements_judgements_SupersededByJudgementId",
                schema: "app",
                table: "judgements",
                column: "SupersededByJudgementId",
                principalSchema: "app",
                principalTable: "judgements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_judgements_judgements_SupersedesJudgementId",
                schema: "app",
                table: "judgements",
                column: "SupersedesJudgementId",
                principalSchema: "app",
                principalTable: "judgements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_judgements_spending_summaries_ResolvingSummaryId",
                schema: "app",
                table: "judgements",
                column: "ResolvingSummaryId",
                principalSchema: "app",
                principalTable: "spending_summaries",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_judgements_spending_summaries_SpendingSummaryId",
                schema: "app",
                table: "judgements",
                column: "SpendingSummaryId",
                principalSchema: "app",
                principalTable: "spending_summaries",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_judgements_judgements_SupersededByJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropForeignKey(
                name: "FK_judgements_judgements_SupersedesJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropForeignKey(
                name: "FK_judgements_spending_summaries_ResolvingSummaryId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropForeignKey(
                name: "FK_judgements_spending_summaries_SpendingSummaryId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropTable(
                name: "commitment_occurrences",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgement_evaluation_runs",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgement_schedules",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgement_user_states",
                schema: "app");

            migrationBuilder.DropTable(
                name: "spending_summary_categories",
                schema: "app");

            migrationBuilder.DropTable(
                name: "judgement_work_items",
                schema: "app");

            migrationBuilder.DropTable(
                name: "spending_summaries",
                schema: "app");

            migrationBuilder.DropIndex(
                name: "IX_judgements_HouseholdId_UserProfileId_Scope_Cadence_Status_E~",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropIndex(
                name: "IX_judgements_ResolvingSummaryId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropIndex(
                name: "IX_judgements_SpendingSummaryId_IssueKey",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropIndex(
                name: "IX_judgements_SupersededByJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropIndex(
                name: "IX_judgements_SupersedesJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropIndex(
                name: "IX_judgement_rules_Code_Cadence_Scope_RuleVersion",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.DropColumn(
                name: "ActionCode",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "ActionParametersJson",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "Cadence",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "CalculationVersion",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "Direction",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "EvidenceJson",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "FocusMetric",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "IssueKey",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "ResolvedAt",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "ResolvingSummaryId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "RuleVersion",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "Scope",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SeverityRank",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SpendingSummaryId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SubjectKey",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SupersededAt",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SupersededByJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "SupersedesJudgementId",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "ThresholdsJson",
                schema: "app",
                table: "judgements");

            migrationBuilder.DropColumn(
                name: "Cadence",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.DropColumn(
                name: "RuleVersion",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.DropColumn(
                name: "Scope",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                schema: "app",
                table: "judgement_rules");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                schema: "app",
                table: "households");

            migrationBuilder.DropColumn(
                name: "TimeZone",
                schema: "app",
                table: "households");

            migrationBuilder.CreateIndex(
                name: "IX_judgement_rules_Code",
                schema: "app",
                table: "judgement_rules",
                column: "Code",
                unique: true);
        }
    }
}
