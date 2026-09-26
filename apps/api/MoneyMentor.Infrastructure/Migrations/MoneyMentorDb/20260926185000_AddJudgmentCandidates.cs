using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MoneyMentor.Infrastructure.Persistence;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb;

[DbContext(typeof(MoneyMentorDbContext))]
[Migration("20260926185000_AddJudgmentCandidates")]
public sealed class AddJudgmentCandidates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE app.judgment_candidates (
                "Id" uuid PRIMARY KEY,
                "HouseholdId" uuid NOT NULL REFERENCES app.households("Id") ON DELETE CASCADE,
                "UserProfileId" uuid NULL REFERENCES app.user_profiles("Id") ON DELETE SET NULL,
                "Scope" varchar(32) NOT NULL, "CandidateType" varchar(64) NOT NULL,
                "SubjectType" varchar(32) NOT NULL, "SubjectId" uuid NULL,
                "SubjectKey" varchar(128) NOT NULL, "DeduplicationKey" varchar(128) NOT NULL,
                "WindowStart" date NOT NULL, "WindowEndExclusive" date NOT NULL,
                "CurrentValue" numeric(18,2) NULL, "BaselineValue" numeric(18,2) NULL,
                "DeviationRatio" numeric(12,4) NULL, "Frequency" integer NULL,
                "InterestingnessScore" numeric(5,4) NOT NULL, "DetectorConfidence" numeric(5,4) NOT NULL,
                "EvidenceJson" jsonb NOT NULL, "DetectorVersion" varchar(32) NOT NULL,
                "CalculationVersion" varchar(32) NOT NULL, "Status" varchar(32) NOT NULL,
                "AttemptCount" integer NOT NULL, "AvailableAt" timestamptz NOT NULL,
                "LeaseExpiresAt" timestamptz NULL, "ClaimToken" uuid NULL,
                "CreatedAt" timestamptz NOT NULL, "EvaluatedAt" timestamptz NULL,
                "ExpiresAt" timestamptz NULL,
                CONSTRAINT "CK_judgment_candidates_score" CHECK ("InterestingnessScore" BETWEEN 0 AND 1)
            );
            CREATE UNIQUE INDEX "IX_judgment_candidates_dedup" ON app.judgment_candidates ("DeduplicationKey");
            CREATE INDEX "IX_judgment_candidates_owner_status" ON app.judgment_candidates
                ("HouseholdId", "UserProfileId", "Status", "CreatedAt");
            CREATE INDEX "IX_judgment_candidates_status_available" ON app.judgment_candidates ("Status", "AvailableAt");
            CREATE INDEX "IX_judgment_candidates_type_subject" ON app.judgment_candidates
                ("CandidateType", "SubjectKey", "WindowStart");
            CREATE INDEX "IX_judgment_candidates_user" ON app.judgment_candidates ("UserProfileId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("DROP TABLE app.judgment_candidates;");
}
