using ChatApp.Core.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ChatApp.Data.Configurations;

/// <summary>
/// EF Core configuration for the Invite entity.
/// Invite codes are unique and URL-safe.
/// </summary>
public class InviteConfiguration : IEntityTypeConfiguration<Invite>
{
    public void Configure(EntityTypeBuilder<Invite> builder)
    {
        builder.HasKey(i => i.Code);

        builder.Property(i => i.Code)
            .HasMaxLength(16);

        builder.HasOne(i => i.Guild)
            .WithMany(g => g.Invites)
            .HasForeignKey(i => i.GuildId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(i => i.Creator)
            .WithMany()
            .HasForeignKey(i => i.CreatorId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(i => i.Code)
            .IsUnique();
    }
}
