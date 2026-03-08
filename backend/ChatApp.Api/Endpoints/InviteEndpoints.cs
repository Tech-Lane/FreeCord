using System.Security.Claims;
using System.Security.Cryptography;
using ChatApp.Core.Entities;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Api;

/// <summary>
/// REST endpoints for guild invites.
/// - Create invite: requires CreateInstantInvite or ManageGuild permission.
/// - Join via invite: authenticated users join the guild and are redirected.
/// </summary>
public static class InviteEndpoints
{
    /// <summary>URL-safe characters for invite codes (lowercase alphanumeric).</summary>
    private const string CodeChars = "abcdefghijklmnopqrstuvwxyz0123456789";

    /// <summary>Default invite code length. Short enough for links, long enough to avoid collisions.</summary>
    private const int CodeLength = 8;

    public static void MapInviteEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api").WithTags("Invites");

        // Create invite: requires JWT + guild membership + permission
        group.MapPost("/guilds/{guildId:guid}/invites", CreateInvite)
            .RequireAuthorization()
            .AddEndpointFilter(Authorization.RequirePermissionFilter.Create(Permissions.CreateInstantInvite));

        // Join via invite: requires JWT (authenticated user joins the guild)
        group.MapPost("/invites/{code}/join", JoinGuildViaInvite)
            .RequireAuthorization();
    }

    /// <summary>
    /// Creates a new invite for the guild with a secure random code.
    /// Returns the shortlink format: nexchat://invite/{code}
    /// </summary>
    private static async Task<IResult> CreateInvite(
        [FromRoute] Guid guildId,
        [FromBody] CreateInviteRequest? request,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var guild = await db.Guilds.FindAsync(guildId);
        if (guild == null) return Results.NotFound();

        // Permission check is handled by RequirePermissionFilter
        var code = await GenerateUniqueCodeAsync(db);
        var expiration = request?.ExpirationMinutes is { } mins
            ? (DateTime?)DateTime.UtcNow.AddMinutes(mins)
            : null;
        var maxUses = request?.MaxUses;

        var invite = new Invite
        {
            Code = code,
            GuildId = guildId,
            CreatorId = userId.Value,
            ExpirationDate = expiration,
            MaxUses = maxUses,
            Uses = 0,
            CreatedAt = DateTime.UtcNow
        };

        db.Invites.Add(invite);
        await db.SaveChangesAsync();

        var shortlink = $"nexchat://invite/{code}";
        return Results.Ok(new { code, shortlink, expiresAt = expiration });
    }

    /// <summary>
    /// Joins the guild using an invite code. Adds the user as a member and returns guild info.
    /// </summary>
    private static async Task<IResult> JoinGuildViaInvite(
        [FromRoute] string code,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(code))
            return Results.BadRequest(new { error = "Invite code is required." });

        code = code.Trim().ToLowerInvariant();

        var invite = await db.Invites
            .Include(i => i.Guild)
            .FirstOrDefaultAsync(i => i.Code == code);

        if (invite == null)
            return Results.NotFound(new { error = "Invalid or expired invite." });

        if (invite.ExpirationDate.HasValue && invite.ExpirationDate.Value < DateTime.UtcNow)
            return Results.BadRequest(new { error = "This invite has expired." });

        if (invite.MaxUses.HasValue && invite.Uses >= invite.MaxUses.Value)
            return Results.BadRequest(new { error = "This invite has reached its maximum uses." });

        var alreadyMember = await db.GuildMembers
            .AnyAsync(gm => gm.GuildId == invite.GuildId && gm.UserId == userId.Value);
        if (alreadyMember)
        {
            var guild = invite.Guild;
            return Results.Ok(new
            {
                guildId = guild.Id,
                guildName = guild.Name,
                alreadyMember = true
            });
        }

        var everyoneRole = await db.Roles
            .FirstOrDefaultAsync(r => r.GuildId == invite.GuildId && r.Name == "@everyone");
        if (everyoneRole == null)
            return Results.Problem("Guild configuration error: @everyone role missing.");

        var member = new GuildMember
        {
            GuildId = invite.GuildId,
            UserId = userId.Value,
            JoinedAt = DateTime.UtcNow
        };
        member.Roles.Add(everyoneRole);

        invite.Uses++;
        db.GuildMembers.Add(member);
        await db.SaveChangesAsync();

        return Results.Ok(new
        {
            guildId = invite.Guild.Id,
            guildName = invite.Guild.Name,
            alreadyMember = false
        });
    }

    /// <summary>
    /// Generates a cryptographically secure, URL-safe invite code.
    /// Retries if collision (extremely rare with 8 chars from 36-char set).
    /// </summary>
    private static async Task<string> GenerateUniqueCodeAsync(ChatDbContext db)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = GenerateSecureCode();
            var exists = await db.Invites.AnyAsync(i => i.Code == code);
            if (!exists) return code;
        }
        throw new InvalidOperationException("Could not generate unique invite code.");
    }

    private static string GenerateSecureCode()
    {
        var bytes = new byte[CodeLength];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        var chars = new char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
            chars[i] = CodeChars[bytes[i] % CodeChars.Length];
        return new string(chars);
    }

    private static Guid? GetUserId(ClaimsPrincipal user)
    {
        var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }
}

/// <summary>Optional request body for creating an invite.</summary>
public record CreateInviteRequest(int? ExpirationMinutes, int? MaxUses);
