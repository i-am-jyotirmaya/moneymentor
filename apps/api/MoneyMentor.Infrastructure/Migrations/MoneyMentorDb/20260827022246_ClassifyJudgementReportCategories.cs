using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class ClassifyJudgementReportCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Direction",
                schema: "app",
                table: "spending_summary_categories",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Neutral");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Direction",
                schema: "app",
                table: "spending_summary_categories");
        }
    }
}
