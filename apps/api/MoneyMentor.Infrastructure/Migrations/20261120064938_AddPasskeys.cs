using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPasskeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "passkey_challenges",
                schema: "auth",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<string>(type: "text", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_passkey_challenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_passkey_challenges_auth_sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "auth",
                        principalTable: "auth_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_passkeys",
                schema: "auth",
                columns: table => new
                {
                    CredentialId = table.Column<byte[]>(type: "bytea", maxLength: 1024, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_passkeys", x => x.CredentialId);
                    table.ForeignKey(
                        name: "FK_user_passkeys_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "auth",
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_passkey_challenges_ExpiresAt",
                schema: "auth",
                table: "passkey_challenges",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_passkey_challenges_SessionId",
                schema: "auth",
                table: "passkey_challenges",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_user_passkeys_UserId",
                schema: "auth",
                table: "user_passkeys",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "passkey_challenges",
                schema: "auth");

            migrationBuilder.DropTable(
                name: "user_passkeys",
                schema: "auth");
        }
    }
}
