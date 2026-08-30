using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class CompleteGoalPlanningRelationships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_goal_plans_ActiveVersionId",
                schema: "app",
                table: "goal_plans",
                column: "ActiveVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_goal_planning_runs_ResultVersionId",
                schema: "app",
                table: "goal_planning_runs",
                column: "ResultVersionId");

            migrationBuilder.AddForeignKey(
                name: "FK_goal_planning_runs_goal_plan_versions_ResultVersionId",
                schema: "app",
                table: "goal_planning_runs",
                column: "ResultVersionId",
                principalSchema: "app",
                principalTable: "goal_plan_versions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_goal_plans_goal_plan_versions_ActiveVersionId",
                schema: "app",
                table: "goal_plans",
                column: "ActiveVersionId",
                principalSchema: "app",
                principalTable: "goal_plan_versions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_goal_planning_runs_goal_plan_versions_ResultVersionId",
                schema: "app",
                table: "goal_planning_runs");

            migrationBuilder.DropForeignKey(
                name: "FK_goal_plans_goal_plan_versions_ActiveVersionId",
                schema: "app",
                table: "goal_plans");

            migrationBuilder.DropIndex(
                name: "IX_goal_plans_ActiveVersionId",
                schema: "app",
                table: "goal_plans");

            migrationBuilder.DropIndex(
                name: "IX_goal_planning_runs_ResultVersionId",
                schema: "app",
                table: "goal_planning_runs");
        }
    }
}
