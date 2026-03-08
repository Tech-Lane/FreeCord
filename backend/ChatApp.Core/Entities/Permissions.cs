namespace ChatApp.Core.Entities;

/// <summary>
/// Bitfield flags for guild-level permissions.
/// Used by Role.PermissionsBitfield and for permission checks in API.
/// Combine with bitwise OR (e.g. ManageChannels | ManageGuild).
/// </summary>
[Flags]
public enum Permissions : ulong
{
    /// <summary>No permissions.</summary>
    None = 0,

    /// <summary>View channels and read messages.</summary>
    ViewChannels = 1 << 0,

    /// <summary>Send text messages.</summary>
    SendMessages = 1 << 1,

    /// <summary>Create, edit, and delete channels.</summary>
    ManageChannels = 1 << 2,

    /// <summary>Manage guild settings, roles, and delete guild.</summary>
    ManageGuild = 1 << 3,

    /// <summary>Create invite links for the guild.</summary>
    CreateInstantInvite = 1 << 4,

    /// <summary>All permissions. Overrides other checks.</summary>
    Administrator = 1UL << 31
}
