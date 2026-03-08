using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatApp.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddServerAdminAndApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsApproved",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsServerAdmin",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill: existing users stay approved; first user (by CreatedAt) becomes server admin
            migrationBuilder.Sql(@"
                UPDATE ""Users"" SET ""IsApproved"" = true;
                UPDATE ""Users"" SET ""IsServerAdmin"" = true
                WHERE ""Id"" = (SELECT ""Id"" FROM ""Users"" ORDER BY ""CreatedAt"" ASC LIMIT 1);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsApproved",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsServerAdmin",
                table: "Users");
        }
    }
}
