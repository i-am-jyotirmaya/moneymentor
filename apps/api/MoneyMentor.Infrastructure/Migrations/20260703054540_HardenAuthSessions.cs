using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class HardenAuthSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Refresh tokens issued before sessions existed cannot be safely linked.
            // Invalidating them makes every existing browser sign in again.
            migrationBuilder.Sql("DELETE FROM auth.refresh_tokens;");

            migrationBuilder.AddColumn<Guid>(
                name: "SessionId",
                schema: "auth",
                table: "refresh_tokens",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "auth_sessions",
                schema: "auth",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedByIp = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: true),
                    RevokedByIp = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_auth_sessions_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "auth",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_refresh_tokens_SessionId",
                schema: "auth",
                table: "refresh_tokens",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_auth_sessions_RevokedAt",
                schema: "auth",
                table: "auth_sessions",
                column: "RevokedAt");

            migrationBuilder.CreateIndex(
                name: "IX_auth_sessions_UserId_ExpiresAt",
                schema: "auth",
                table: "auth_sessions",
                columns: new[] { "UserId", "ExpiresAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_refresh_tokens_auth_sessions_SessionId",
                schema: "auth",
                table: "refresh_tokens",
                column: "SessionId",
                principalSchema: "auth",
                principalTable: "auth_sessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_refresh_tokens_auth_sessions_SessionId",
                schema: "auth",
                table: "refresh_tokens");

            migrationBuilder.DropTable(
                name: "auth_sessions",
                schema: "auth");

            migrationBuilder.DropIndex(
                name: "IX_refresh_tokens_SessionId",
                schema: "auth",
                table: "refresh_tokens");

            migrationBuilder.DropColumn(
                name: "SessionId",
                schema: "auth",
                table: "refresh_tokens");
        }
    }
}
