namespace ChatApp.Core.Entities;

/// <summary>
/// Represents an invite link for joining a guild.
/// Invites use a short, URL-safe code for deep links (e.g. nexchat://invite/abc123).
/// </summary>
public class Invite
{
    /// <summary>Unique invite code (short, URL-safe).</summary>
    public string Code { get; set; } = null!;

    /// <summary>Guild this invite targets.</summary>
    public Guid GuildId { get; set; }

    /// <summary>User who created the invite.</summary>
    public Guid CreatorId { get; set; }

    /// <summary>When the invite expires. Null = never expires.</summary>
    public DateTime? ExpirationDate { get; set; }

    /// <summary>Maximum number of uses. Null = unlimited.</summary>
    public int? MaxUses { get; set; }

    /// <summary>Current number of times the invite has been used.</summary>
    public int Uses { get; set; }

    /// <summary>When the invite was created.</summary>
    public DateTime CreatedAt { get; set; }

    public Guild Guild { get; set; } = null!;
    public User Creator { get; set; } = null!;
}
