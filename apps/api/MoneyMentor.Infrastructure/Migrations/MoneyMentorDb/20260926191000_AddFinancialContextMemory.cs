using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MoneyMentor.Infrastructure.Persistence;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb;

[DbContext(typeof(MoneyMentorDbContext))]
[Migration("20260926191000_AddFinancialContextMemory")]
public sealed class AddFinancialContextMemory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE EXTENSION IF NOT EXISTS vector;
            CREATE TABLE app.judgment_feedback (
                "Id" uuid PRIMARY KEY,
                "HouseholdId" uuid NOT NULL REFERENCES app.households("Id") ON DELETE CASCADE,
                "UserProfileId" uuid NOT NULL REFERENCES app.user_profiles("Id") ON DELETE CASCADE,
                "JudgementId" uuid NOT NULL REFERENCES app.judgements("Id") ON DELETE CASCADE,
                "Text" varchar(2000) NOT NULL, "Visibility" varchar(32) NOT NULL,
                "Status" varchar(32) NOT NULL, "AttemptCount" integer NOT NULL,
                "AvailableAt" timestamptz NOT NULL, "ClaimToken" uuid NULL,
                "LeaseExpiresAt" timestamptz NULL, "ValidUntil" timestamptz NULL,
                "CreatedAt" timestamptz NOT NULL, "ProcessedAt" timestamptz NULL
            );
            CREATE INDEX "IX_judgment_feedback_status_available"
                ON app.judgment_feedback ("Status", "AvailableAt");
            CREATE INDEX "IX_judgment_feedback_owner_created"
                ON app.judgment_feedback ("HouseholdId", "UserProfileId", "CreatedAt");
            CREATE INDEX "IX_judgment_feedback_user" ON app.judgment_feedback ("UserProfileId");
            CREATE INDEX "IX_judgment_feedback_judgement" ON app.judgment_feedback ("JudgementId");

            CREATE TABLE app.financial_context_memories (
                "Id" uuid PRIMARY KEY,
                "HouseholdId" uuid NOT NULL REFERENCES app.households("Id") ON DELETE CASCADE,
                "UserProfileId" uuid NOT NULL REFERENCES app.user_profiles("Id") ON DELETE CASCADE,
                "Visibility" varchar(32) NOT NULL, "MemoryType" varchar(64) NOT NULL,
                "Text" varchar(2000) NOT NULL, "StructuredDataJson" jsonb NOT NULL,
                "SourceType" varchar(32) NOT NULL,
                "SourceMessageId" uuid NULL REFERENCES app.assistant_messages("Id") ON DELETE SET NULL,
                "SourceJudgementId" uuid NULL REFERENCES app.judgements("Id") ON DELETE SET NULL,
                "SourceFeedbackId" uuid NULL REFERENCES app.judgment_feedback("Id") ON DELETE SET NULL,
                "Confidence" numeric(5,4) NOT NULL, "Importance" numeric(5,2) NOT NULL,
                "ValidFrom" timestamptz NULL, "ValidUntil" timestamptz NULL,
                "IsActive" boolean NOT NULL, "EmbeddingModel" varchar(100) NULL,
                "Embedding" vector(1536) NULL,
                "CreatedAt" timestamptz NOT NULL, "UpdatedAt" timestamptz NOT NULL
            );
            CREATE UNIQUE INDEX "IX_financial_context_memories_feedback" ON app.financial_context_memories ("SourceFeedbackId");
            CREATE INDEX "IX_financial_context_memories_personal" ON app.financial_context_memories
                ("HouseholdId", "UserProfileId", "IsActive", "ValidUntil", "MemoryType");
            CREATE INDEX "IX_financial_context_memories_household" ON app.financial_context_memories
                ("HouseholdId", "Visibility", "IsActive", "ValidUntil");
            CREATE INDEX "IX_financial_context_memories_message" ON app.financial_context_memories ("SourceMessageId");
            CREATE INDEX "IX_financial_context_memories_judgement" ON app.financial_context_memories ("SourceJudgementId");
            CREATE INDEX "IX_financial_context_memories_user" ON app.financial_context_memories ("UserProfileId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE app.financial_context_memories;
            DROP TABLE app.judgment_feedback;
            -- The vector extension can be shared by other database features; retain it.
            """);
    }
}
