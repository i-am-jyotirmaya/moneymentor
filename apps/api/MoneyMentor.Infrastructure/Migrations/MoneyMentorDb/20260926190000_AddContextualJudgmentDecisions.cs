using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MoneyMentor.Infrastructure.Persistence;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb;

[DbContext(typeof(MoneyMentorDbContext))]
[Migration("20260926190000_AddContextualJudgmentDecisions")]
public sealed class AddContextualJudgmentDecisions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE app.judgements
                ADD COLUMN "CandidateId" uuid NULL REFERENCES app.judgment_candidates("Id") ON DELETE CASCADE,
                ADD COLUMN "DecisionAction" varchar(32) NULL,
                ADD COLUMN "Importance" numeric(5,2) NULL,
                ADD COLUMN "DecisionConfidence" numeric(5,4) NULL,
                ADD COLUMN "Reason" varchar(1024) NULL,
                ADD COLUMN "FollowUpQuestion" varchar(512) NULL,
                ADD COLUMN "ContextSnapshotJson" jsonb NULL,
                ADD COLUMN "Provider" varchar(64) NULL,
                ADD COLUMN "Model" varchar(100) NULL,
                ADD COLUMN "DecisionSchemaVersion" varchar(32) NULL;
            CREATE INDEX "IX_judgements_candidate" ON app.judgements ("CandidateId");
            ALTER TABLE app.judgement_evaluation_runs
                ALTER COLUMN "SpendingSummaryId" DROP NOT NULL,
                ADD COLUMN "CandidateId" uuid NULL REFERENCES app.judgment_candidates("Id") ON DELETE SET NULL,
                ADD COLUMN "ContextSnapshotJson" jsonb NULL;
            CREATE UNIQUE INDEX "IX_judgement_evaluation_runs_candidate_attempt"
                ON app.judgement_evaluation_runs ("CandidateId", "Stage", "AttemptNumber")
                WHERE "CandidateId" IS NOT NULL;
            ALTER TABLE app.judgement_evaluation_runs ADD CONSTRAINT "CK_judgement_run_source"
                CHECK (("SpendingSummaryId" IS NOT NULL) <> ("CandidateId" IS NOT NULL));
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE app.judgement_evaluation_runs DROP CONSTRAINT "CK_judgement_run_source";
            ALTER TABLE app.judgement_evaluation_runs DROP COLUMN "CandidateId";
            ALTER TABLE app.judgement_evaluation_runs DROP COLUMN "ContextSnapshotJson";
            ALTER TABLE app.judgement_evaluation_runs ALTER COLUMN "SpendingSummaryId" SET NOT NULL;
            ALTER TABLE app.judgements DROP COLUMN "CandidateId";
            ALTER TABLE app.judgements DROP COLUMN "DecisionAction";
            ALTER TABLE app.judgements DROP COLUMN "Importance";
            ALTER TABLE app.judgements DROP COLUMN "DecisionConfidence";
            ALTER TABLE app.judgements DROP COLUMN "Reason";
            ALTER TABLE app.judgements DROP COLUMN "FollowUpQuestion";
            ALTER TABLE app.judgements DROP COLUMN "ContextSnapshotJson";
            ALTER TABLE app.judgements DROP COLUMN "Provider";
            ALTER TABLE app.judgements DROP COLUMN "Model";
            ALTER TABLE app.judgements DROP COLUMN "DecisionSchemaVersion";
            """);
    }
}
