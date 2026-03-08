using System.Security.Claims;
using ChatApp.Core.Entities;
using ChatApp.Core.Repositories;
using ChatApp.Core.Services;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Api;

/// <summary>
/// REST endpoints for guilds (servers), channels, and message history.
/// All endpoints require JWT authentication and validate guild membership.
/// Create/delete operations enforce permission checks via RequirePermissionFilter.
/// </summary>
public static class GuildEndpoints
{
    public static void MapGuildEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api").WithTags("Guilds").RequireAuthorization();

        group.MapGet("/guilds", GetUserGuilds);
        group.MapGet("/guilds/{guildId:guid}/my-permissions", GetMyPermissions);
        group.MapGet("/guilds/{guildId:guid}/channels", GetGuildChannels);
        group.MapGet("/guilds/{guildId:guid}/channels/{channelId:guid}/messages", GetChannelMessages);
        group.MapPost("/guilds", CreateGuild);
        group.MapDelete("/guilds/{guildId:guid}", DeleteGuild)
            .AddEndpointFilter(Authorization.RequirePermissionFilter.Create(Permissions.ManageGuild));
        group.MapPost("/guilds/{guildId:guid}/channels", CreateChannel)
            .AddEndpointFilter(Authorization.RequirePermissionFilter.Create(Permissions.ManageChannels));
    }

    /// <summary>
    /// Returns the guilds (servers) the authenticated user has joined.
    /// </summary>
    private static async Task<IResult> GetUserGuilds(
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var guilds = await db.GuildMembers
            .Where(gm => gm.UserId == userId.Value)
            .Select(gm => new { gm.Guild.Id, gm.Guild.Name, gm.Guild.OwnerId })
            .ToListAsync();

        return Results.Ok(guilds);
    }

    /// <summary>
    /// Returns the channels for a guild. Validates that the user is a member.
    /// </summary>
    private static async Task<IResult> GetGuildChannels(
        [FromRoute] Guid guildId,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var isMember = await db.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildId && gm.UserId == userId.Value);
        if (!isMember) return Results.NotFound();

        var channels = await db.Channels
            .Where(c => c.GuildId == guildId)
            .OrderBy(c => c.Type)
            .ThenBy(c => c.Position)
            .Select(c => new { c.Id, c.Name, c.Type, c.Position })
            .ToListAsync();

        return Results.Ok(channels);
    }

    /// <summary>
    /// Returns the last 50 messages for a channel. Validates guild membership.
    /// </summary>
    private static async Task<IResult> GetChannelMessages(
        [FromRoute] Guid guildId,
        [FromRoute] Guid channelId,
        [FromServices] IMessageRepository messageRepository,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var channel = await db.Channels
            .FirstOrDefaultAsync(c => c.Id == channelId && c.GuildId == guildId);
        if (channel == null) return Results.NotFound();

        var isMember = await db.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildId && gm.UserId == userId.Value);
        if (!isMember) return Results.NotFound();

        var messages = await messageRepository.GetLast50ByChannelAsync(channelId);
        var dtos = messages.Select(m => new
        {
            m.Id,
            m.ChannelId,
            m.AuthorId,
            m.AuthorUsername,
            m.Content,
            m.CreatedAt,
            m.EditedAt,
            m.AttachmentUrl
        });

        return Results.Ok(dtos);
    }

    /// <summary>
    /// Returns the current user's effective permission bitfield for a guild.
    /// Used by the client to conditionally show UI (e.g. Create Channel, Delete Server).
    /// </summary>
    private static async Task<IResult> GetMyPermissions(
        [FromRoute] Guid guildId,
        [FromServices] IPermissionService permissionService,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var isMember = await db.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildId && gm.UserId == userId.Value);
        if (!isMember) return Results.NotFound();

        var permissions = await permissionService.GetEffectivePermissionsAsync(userId.Value, guildId);
        return Results.Ok(new { permissions = permissions ?? 0UL });
    }

    /// <summary>
    /// Creates a new guild. The authenticated user becomes the owner.
    /// Creates a default @everyone role with ViewChannels and SendMessages.
    /// </summary>
    private static async Task<IResult> CreateGuild(
        [FromBody] CreateGuildRequest request,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Name))
            return Results.BadRequest(new { error = "Guild name is required." });

        var guild = new Guild
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            OwnerId = userId.Value,
            CreatedAt = DateTime.UtcNow
        };

        var member = new GuildMember
        {
            GuildId = guild.Id,
            UserId = userId.Value,
            JoinedAt = DateTime.UtcNow
        };

        var everyoneRole = new Role
        {
            Id = Guid.NewGuid(),
            GuildId = guild.Id,
            Name = "@everyone",
            Color = null,
            PermissionsBitfield = (ulong)(Permissions.ViewChannels | Permissions.SendMessages | Permissions.CreateInstantInvite)
        };

        db.Guilds.Add(guild);
        db.GuildMembers.Add(member);
        db.Roles.Add(everyoneRole);
        member.Roles.Add(everyoneRole);
        await db.SaveChangesAsync();

        return Results.Created($"/api/guilds/{guild.Id}", new { guild.Id, guild.Name, guild.OwnerId });
    }

    /// <summary>
    /// Deletes a guild. Requires ManageGuild permission (owner has it by default).
    /// </summary>
    private static async Task<IResult> DeleteGuild(
        [FromRoute] Guid guildId,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        var guild = await db.Guilds.FindAsync(guildId);
        if (guild == null) return Results.NotFound();

        db.Guilds.Remove(guild);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }

    /// <summary>
    /// Creates a new channel in the guild. Requires ManageChannels permission.
    /// </summary>
    private static async Task<IResult> CreateChannel(
        [FromRoute] Guid guildId,
        [FromBody] CreateChannelRequest request,
        [FromServices] ChatDbContext db,
        ClaimsPrincipal user)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Results.BadRequest(new { error = "Channel name is required." });

        var maxPosition = await db.Channels
            .Where(c => c.GuildId == guildId && c.Type == request.Type)
            .Select(c => (int?)c.Position)
            .DefaultIfEmpty(-1)
            .MaxAsync();

        var channel = new Channel
        {
            Id = Guid.NewGuid(),
            GuildId = guildId,
            Name = request.Name.Trim(),
            Type = request.Type,
            Position = (maxPosition ?? -1) + 1,
            CreatedAt = DateTime.UtcNow
        };

        db.Channels.Add(channel);
        await db.SaveChangesAsync();

        return Results.Created($"/api/guilds/{guildId}/channels/{channel.Id}", new { channel.Id, channel.Name, channel.Type, channel.Position });
    }

    private static Guid? GetUserId(ClaimsPrincipal user)
    {
        var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }
}

/// <summary>Request body for creating a guild.</summary>
public record CreateGuildRequest(string Name);

/// <summary>Request body for creating a channel.</summary>
public record CreateChannelRequest(string Name, ChannelType Type);
