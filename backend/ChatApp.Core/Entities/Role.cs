namespace ChatApp.Core.Entities;

/// <summary>
/// A role within a guild. Roles define permissions (ManageChannels, ManageGuild, etc.)
/// and are assigned to guild members. A member's effective permissions are the
/// bitwise OR of all their role permission bitfields.
/// </summary>
public class Role
{
    public Guid Id { get; set; }
    public Guid GuildId { get; set; }
    public string Name { get; set; } = null!;
    /// <summary>Hex color for role display (e.g. "#5865F2").</summary>
    public string? Color { get; set; }
    /// <summary>Bitfield of <see cref="Permissions"/> flags.</summary>
    public ulong PermissionsBitfield { get; set; }

    public Guild Guild { get; set; } = null!;
    public ICollection<GuildMember> Members { get; set; } = new List<GuildMember>();
}
