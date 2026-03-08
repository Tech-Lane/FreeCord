namespace ChatApp.Core.Entities;

/// <summary>
/// Represents a user's membership in a guild. Members can have multiple roles;
/// effective permissions are the bitwise OR of all assigned role permission bitfields.
/// </summary>
public class GuildMember
{
    public Guid GuildId { get; set; }
    public Guid UserId { get; set; }
    public string? Nickname { get; set; }
    public DateTime JoinedAt { get; set; }

    public Guild Guild { get; set; } = null!;
    public User User { get; set; } = null!;
    /// <summary>Roles assigned to this member. Effective permissions = OR of all role bitfields.</summary>
    public ICollection<Role> Roles { get; set; } = new List<Role>();
}
