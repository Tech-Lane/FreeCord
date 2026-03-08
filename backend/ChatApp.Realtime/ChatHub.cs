using System.Security.Claims;
using ChatApp.Core.Entities;
using ChatApp.Core.Repositories;
using ChatApp.Core.Services;
using ChatApp.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Realtime;

[Authorize]
public class ChatHub : Hub
{
    private readonly ChatDbContext _dbContext;
    private readonly IPresenceService _presenceService;
    private readonly IMessageRepository _messageRepository;
    private readonly IVoiceCoordinationService _voiceCoordinationService;

    public ChatHub(
        ChatDbContext dbContext,
        IPresenceService presenceService,
        IMessageRepository messageRepository,
        IVoiceCoordinationService voiceCoordinationService)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
        _presenceService = presenceService ?? throw new ArgumentNullException(nameof(presenceService));
        _messageRepository = messageRepository ?? throw new ArgumentNullException(nameof(messageRepository));
        _voiceCoordinationService = voiceCoordinationService ?? throw new ArgumentNullException(nameof(voiceCoordinationService));
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId.HasValue)
        {
            await _presenceService.SetOnlineAsync(userId.Value);
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();
        if (userId.HasValue)
        {
            await _presenceService.SetOfflineAsync(userId.Value);
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Joins a group representing a Guild. Enables receiving messages and events for that guild.
    /// </summary>
    public async Task JoinGroup(string guildId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        if (!Guid.TryParse(guildId, out var guildGuid))
        {
            throw new HubException("Invalid guild ID.");
        }

        var isMember = await _dbContext.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildGuid && gm.UserId == userId.Value);
        if (!isMember)
        {
            throw new HubException("You are not a member of this guild.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GetGroupName(guildGuid));
    }

    /// <summary>
    /// Leaves a guild group.
    /// </summary>
    public async Task LeaveGroup(string guildId)
    {
        if (Guid.TryParse(guildId, out var guildGuid))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetGroupName(guildGuid));
        }
    }

    /// <summary>
    /// Sends a message to a channel within a guild. Persists the message and broadcasts to the guild group.
    /// </summary>
    public async Task SendMessage(string guildId, string channelId, string content)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        if (!Guid.TryParse(guildId, out var guildGuid) || !Guid.TryParse(channelId, out var channelGuid))
        {
            throw new HubException("Invalid guild or channel ID.");
        }

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new HubException("Message content cannot be empty.");
        }

        var channel = await _dbContext.Channels
            .FirstOrDefaultAsync(c => c.Id == channelGuid && c.GuildId == guildGuid);
        if (channel == null)
        {
            throw new HubException("Channel not found or does not belong to this guild.");
        }

        var isMember = await _dbContext.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildGuid && gm.UserId == userId.Value);
        if (!isMember)
        {
            throw new HubException("You are not a member of this guild.");
        }

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ChannelId = channelGuid,
            AuthorId = userId.Value,
            Content = content.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Messages.Add(message);
        await _dbContext.SaveChangesAsync();

        var author = await _dbContext.Users
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Username)
            .FirstOrDefaultAsync();

        await Clients.Group(GetGroupName(guildGuid))
            .SendAsync("MessageReceived", new
            {
                message.Id,
                message.ChannelId,
                message.AuthorId,
                AuthorUsername = author,
                message.Content,
                message.CreatedAt,
                message.EditedAt
            });
    }

    /// <summary>
    /// Broadcasts a typing indicator to the guild group.
    /// </summary>
    public async Task UserTyping(string guildId, string channelId, bool isTyping)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        if (!Guid.TryParse(guildId, out var guildGuid) || !Guid.TryParse(channelId, out var channelGuid))
        {
            throw new HubException("Invalid guild or channel ID.");
        }

        var isMember = await _dbContext.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildGuid && gm.UserId == userId.Value);
        if (!isMember)
        {
            throw new HubException("You are not a member of this guild.");
        }

        var username = Context.User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";

        await Clients.OthersInGroup(GetGroupName(guildGuid))
            .SendAsync("UserTyping", new
            {
                UserId = userId.Value,
                Username = username,
                ChannelId = channelGuid,
                IsTyping = isTyping
            });
    }

    /// <summary>
    /// Provisions a WebRTC transport slot from the voice service and returns connection details
    /// for the client to join a voice channel. Validates guild membership and that the channel
    /// is a voice channel before calling the Node.js voice microservice via gRPC.
    /// </summary>
    /// <param name="guildId">The guild containing the voice channel.</param>
    /// <param name="channelId">The voice channel to join.</param>
    /// <returns>Connection details (transportId, iceParameters, iceCandidates, dtlsParameters) for WebRTC setup.</returns>
    public async Task<object> JoinVoiceChannel(string guildId, string channelId)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
        {
            throw new HubException("Unauthorized.");
        }

        if (!Guid.TryParse(guildId, out var guildGuid) || !Guid.TryParse(channelId, out var channelGuid))
        {
            throw new HubException("Invalid guild or channel ID.");
        }

        var channel = await _dbContext.Channels
            .FirstOrDefaultAsync(c => c.Id == channelGuid && c.GuildId == guildGuid);
        if (channel == null)
        {
            throw new HubException("Channel not found or does not belong to this guild.");
        }

        if (channel.Type != ChannelType.Voice)
        {
            throw new HubException("Channel is not a voice channel.");
        }

        var isMember = await _dbContext.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildGuid && gm.UserId == userId.Value);
        if (!isMember)
        {
            throw new HubException("You are not a member of this guild.");
        }

        var details = await _voiceCoordinationService.ProvisionWebRtcTransportAsync(
            appData: channelId,
            cancellationToken: Context.ConnectionAborted);

        return new
        {
            transportId = details.TransportId,
            iceParameters = new { details.IceParameters.UsernameFragment, details.IceParameters.Password, details.IceParameters.IceLite },
            iceCandidates = details.IceCandidates.Select(c => new { c.Foundation, c.Priority, c.Ip, c.Port, c.Type, c.Protocol, c.Address, c.TcpType }),
            dtlsParameters = new { details.DtlsParameters.Role, fingerprints = details.DtlsParameters.Fingerprints.Select(f => new { f.Algorithm, f.Value }) }
        };
    }

    /// <summary>
    /// Fetches the last 50 messages for a channel when a user connects. Uses high-performance raw SQL.
    /// </summary>
    public async Task<IReadOnlyList<object>> GetChannelHistory(string guildId, string channelId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Array.Empty<object>();

        if (!Guid.TryParse(guildId, out var guildGuid) || !Guid.TryParse(channelId, out var channelGuid))
        {
            throw new HubException("Invalid guild or channel ID.");
        }

        var channel = await _dbContext.Channels
            .FirstOrDefaultAsync(c => c.Id == channelGuid && c.GuildId == guildGuid);
        if (channel == null)
        {
            throw new HubException("Channel not found or does not belong to this guild.");
        }

        var isMember = await _dbContext.GuildMembers
            .AnyAsync(gm => gm.GuildId == guildGuid && gm.UserId == userId.Value);
        if (!isMember)
        {
            throw new HubException("You are not a member of this guild.");
        }

        var messages = await _messageRepository.GetLast50ByChannelAsync(channelGuid);
        return messages.Select(m => new
        {
            m.Id,
            m.ChannelId,
            m.AuthorId,
            m.AuthorUsername,
            m.Content,
            m.CreatedAt,
            m.EditedAt
        }).ToList<object>();
    }

    private Guid? GetUserId()
    {
        var idClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }

    private static string GetGroupName(Guid guildId) => $"guild:{guildId:N}";
}
