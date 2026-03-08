using ChatApp.Core.Entities;
using ChatApp.Core.Services;
using PermissionsEntity = ChatApp.Core.Entities.Permissions;
using ChatApp.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Data.Permissions;

/// <summary>
/// Computes effective guild permissions from guild membership and roles.
/// Owners have all permissions; other members get OR of their role bitfields.
/// </summary>
public class PermissionService : IPermissionService
{
    private readonly ChatDbContext _db;

    public PermissionService(ChatDbContext db)
    {
        _db = db;
    }

    /// <inheritdoc />
    public async Task<ulong?> GetEffectivePermissionsAsync(Guid userId, Guid guildId, CancellationToken ct = default)
    {
        var guild = await _db.Guilds
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == guildId, ct);

        if (guild == null) return null;

        // Guild owner has all permissions (Administrator)
        if (guild.OwnerId == userId)
            return (ulong)PermissionsEntity.Administrator;

        var member = await _db.GuildMembers
            .AsNoTracking()
            .Include(gm => gm.Roles)
            .FirstOrDefaultAsync(gm => gm.GuildId == guildId && gm.UserId == userId, ct);

        if (member == null) return null;

        // Effective permissions = OR of all role bitfields
        ulong effective = 0;
        foreach (var role in member.Roles)
            effective |= role.PermissionsBitfield;

        // Administrator overrides to all permissions
        if (((PermissionsEntity)effective).HasFlag(PermissionsEntity.Administrator))
            return (ulong)PermissionsEntity.Administrator;

        return effective;
    }

    /// <inheritdoc />
    public async Task<bool> HasPermissionAsync(Guid userId, Guid guildId, PermissionsEntity permission, CancellationToken ct = default)
    {
        var effective = await GetEffectivePermissionsAsync(userId, guildId, ct);
        if (effective == null) return false;

        var effectiveEnum = (PermissionsEntity)effective.Value;
        if (effectiveEnum.HasFlag(PermissionsEntity.Administrator)) return true;
        return effectiveEnum.HasFlag(permission);
    }
}
