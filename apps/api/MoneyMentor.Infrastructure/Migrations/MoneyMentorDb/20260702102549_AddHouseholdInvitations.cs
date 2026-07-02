using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MoneyMentor.Infrastructure.Migrations.MoneyMentorDb
{
    /// <inheritdoc />
    public partial class AddHouseholdInvitations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "household_invitations",
                schema: "app",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvitedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: false),
                    RespondedByUserProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RespondedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_household_invitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_household_invitations_households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalSchema: "app",
                        principalTable: "households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_household_invitations_user_profiles_InvitedByUserProfileId",
                        column: x => x.InvitedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_household_invitations_user_profiles_RespondedByUserProfileId",
                        column: x => x.RespondedByUserProfileId,
                        principalSchema: "app",
                        principalTable: "user_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_Email_Status_ExpiresAt",
                schema: "app",
                table: "household_invitations",
                columns: new[] { "Email", "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_HouseholdId_Email",
                schema: "app",
                table: "household_invitations",
                columns: new[] { "HouseholdId", "Email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_InvitedByUserProfileId",
                schema: "app",
                table: "household_invitations",
                column: "InvitedByUserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_household_invitations_RespondedByUserProfileId",
                schema: "app",
                table: "household_invitations",
                column: "RespondedByUserProfileId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "household_invitations",
                schema: "app");
        }
    }
}
