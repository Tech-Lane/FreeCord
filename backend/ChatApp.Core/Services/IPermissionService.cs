using ChatApp.Core.Entities;

namespace ChatApp.Core.Services;

/// <summary>
/// Computes effective guild permissions for users. Guild owners have all permissions.
/// Non-owners get the bitwise OR of all their role permission bitfields.
/// </summary>
public interface IPermissionService
{
    /// <summary>
    /// Gets the effective permission bitfield for a user in a guild.
    /// Owners always have Administrator (all permissions). Otherwise, returns
    /// the bitwise OR of all role permissions assigned to the member.
    /// Returns null if the user is not a member of the guild.
    /// </summary>
    Task<ulong?> GetEffectivePermissionsAsync(Guid userId, Guid guildId, CancellationToken ct = default);

    /// <summary>
    /// Checks whether the user has the specified permission in the guild.
    /// Administrator implies all permissions.
    /// </summary>
    Task<bool> HasPermissionAsync(Guid userId, Guid guildId, Permissions permission, CancellationToken ct = default);
}
