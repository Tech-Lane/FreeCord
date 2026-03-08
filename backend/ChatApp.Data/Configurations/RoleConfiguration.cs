using ChatApp.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatApp.Data.Configurations;

/// <summary>
/// EF Core configuration for Role entity. Configures many-to-many with GuildMember
/// via the GuildMemberRole join table.
/// </summary>
public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.HasKey(r => r.Id);

        builder.HasOne(r => r.Guild)
            .WithMany(g => g.Roles)
            .HasForeignKey(r => r.GuildId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(r => r.Members)
            .WithMany(gm => gm.Roles)
            .UsingEntity<Dictionary<string, object>>(
                "GuildMemberRole",
                j => j.HasOne<GuildMember>().WithMany().HasForeignKey("GuildId", "UserId")
                    .OnDelete(DeleteBehavior.Cascade),
                j => j.HasOne<Role>().WithMany().HasForeignKey("RoleId")
                    .OnDelete(DeleteBehavior.Cascade))
            .ToTable("GuildMemberRoles");
    }
}
