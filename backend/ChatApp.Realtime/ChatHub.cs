using System.Security.Claims;
using ChatApp.Core.Entities;
using ChatApp.Core.Repositories;
using ChatApp.Core.Services;
using ChatApp.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Realtime;

/// <summary>
/// DTO for deserializing DTLS parameters from the client.
/// </summary>
internal record DtlsParametersPayload(string? Role, List<DtlsFingerprintPayload>? Fingerprints);

/// <summary>
/// DTO for deserializing DTLS fingerprint from the client.
/// </summary>
internal record DtlsFingerprintPayload(string? Algorithm, string? Value);

[Authorize]
public class ChatHub : Hub
{
    private readonly ChatDbContext _dbContext;
    private readonly IPresenceService _presenceService;
    private readonly IMessageRepository _messageRepository;
    private readonly IVoiceCoordinationService _voiceCoordinationService;
    private readonly VoiceChannelState _voiceState;

    public ChatHub(
        ChatDbContext dbContext,
        IPresenceService presenceService,
        IMessageRepository messageRepository,
        IVoiceCoordinationService voiceCoordinationService,
        VoiceChannelState voiceState)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
        _presenceService = presenceService ?? throw new ArgumentNullException(nameof(presenceService));
        _messageRepository = messageRepository ?? throw new ArgumentNullException(nameof(messageRepository));
        _voiceCoordinationService = voiceCoordinationService ?? throw new ArgumentNullException(nameof(voiceCoordinationService));
        _voiceState = voiceState ?? throw new ArgumentNullException(nameof(voiceState));
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

        // Remove from voice channel if currently in one
        var room = _voiceState.GetRoomForConnection(Context.ConnectionId);
        if (room.HasValue)
        {
            var removed = _voiceState.RemoveByConnection(Context.ConnectionId);
            if (removed != null)
            {
                await Clients.Group(GetGroupName(Guid.Parse(room.Value.GuildId)))
                    .SendAsync("VoiceParticipantLeft", new
                    {
                        GuildId = room.Value.GuildId,
                        ChannelId = room.Value.ChannelId,
                        UserId = removed.UserId,
                        ConnectionId = removed.ConnectionId,
                        Username = removed.Username
                    });
            }
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
    /// Content or attachmentUrl (or both) must be provided. attachmentUrl is a relative URL from media upload (e.g. /uploads/xyz.png).
    /// </summary>
    public async Task SendMessage(string guildId, string channelId, string content, string? attachmentUrl = null)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        if (!Guid.TryParse(guildId, out var guildGuid) || !Guid.TryParse(channelId, out var channelGuid))
        {
            throw new HubException("Invalid guild or channel ID.");
        }

        var hasContent = !string.IsNullOrWhiteSpace(content);
        var hasAttachment = !string.IsNullOrWhiteSpace(attachmentUrl);
        if (!hasContent && !hasAttachment)
        {
            throw new HubException("Message must have content or an attachment.");
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
            Content = hasContent ? content!.Trim() : string.Empty,
            AttachmentUrl = hasAttachment ? attachmentUrl!.Trim() : null,
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
                message.EditedAt,
                message.AttachmentUrl
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
    /// Returns the router RTP capabilities needed for mediasoup-client Device.load().
    /// Call this before CreateWebRtcTransport when joining a voice channel.
    /// </summary>
    /// <returns>Router RTP capabilities as JSON object.</returns>
    public async Task<object> GetRouterRtpCapabilities()
    {
        var userId = GetUserId();
        if (!userId.HasValue)
        {
            throw new HubException("Unauthorized.");
        }

        var json = await _voiceCoordinationService.GetRouterRtpCapabilitiesAsync(Context.ConnectionAborted);
        return System.Text.Json.JsonSerializer.Deserialize<object>(json) ?? new { };
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

        // Track participant in voice channel and broadcast to guild
        var username = Context.User?.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown";
        var participant = _voiceState.AddParticipant(guildId, channelId, userId.Value, Context.ConnectionId, username);

        await Clients.Group(GetGroupName(guildGuid))
            .SendAsync("VoiceParticipantJoined", new
            {
                GuildId = guildId,
                ChannelId = channelId,
                UserId = participant.UserId,
                ConnectionId = participant.ConnectionId,
                Username = participant.Username,
                IsMuted = participant.IsMuted,
                IsDeafened = participant.IsDeafened,
                IsSpeaking = participant.IsSpeaking
            });

        return new
        {
            transportId = details.TransportId,
            iceParameters = new { details.IceParameters.UsernameFragment, details.IceParameters.Password, details.IceParameters.IceLite },
            iceCandidates = details.IceCandidates.Select(c => new { c.Foundation, c.Priority, c.Ip, c.Port, c.Type, c.Protocol, c.Address, c.TcpType }),
            dtlsParameters = new { details.DtlsParameters.Role, fingerprints = details.DtlsParameters.Fingerprints.Select(f => new { f.Algorithm, f.Value }) }
        };
    }

    /// <summary>
    /// Leaves a voice channel. Call when the client explicitly disconnects from voice.
    /// Removes the participant and broadcasts VoiceParticipantLeft to the guild.
    /// </summary>
    public async Task LeaveVoiceChannel(string guildId, string channelId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        var removed = _voiceState.RemoveByConnection(Context.ConnectionId);
        if (removed != null && Guid.TryParse(guildId, out var guildGuid))
        {
            await Clients.Group(GetGroupName(guildGuid))
                .SendAsync("VoiceParticipantLeft", new
                {
                    GuildId = guildId,
                    ChannelId = channelId,
                    UserId = removed.UserId,
                    ConnectionId = removed.ConnectionId,
                    Username = removed.Username
                });
        }
    }

    /// <summary>
    /// Updates the current user's mute state in the voice channel.
    /// Broadcasts VoiceParticipantUpdated so other clients can show a muted icon.
    /// </summary>
    public async Task SetVoiceMute(string guildId, string channelId, bool isMuted)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        var updated = _voiceState.UpdateMute(guildId, channelId, Context.ConnectionId, isMuted);
        if (updated != null && Guid.TryParse(guildId, out var guildGuid))
        {
            await Clients.Group(GetGroupName(guildGuid))
                .SendAsync("VoiceParticipantUpdated", new
                {
                    GuildId = guildId,
                    ChannelId = channelId,
                    UserId = updated.UserId,
                    ConnectionId = updated.ConnectionId,
                    Username = updated.Username,
                    IsMuted = updated.IsMuted,
                    IsDeafened = updated.IsDeafened,
                    IsSpeaking = updated.IsSpeaking
                });
        }
    }

    /// <summary>
    /// Updates the current user's deafen state in the voice channel.
    /// Broadcasts VoiceParticipantUpdated for UI consistency.
    /// </summary>
    public async Task SetVoiceDeafen(string guildId, string channelId, bool isDeafened)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        var updated = _voiceState.UpdateDeafen(guildId, channelId, Context.ConnectionId, isDeafened);
        if (updated != null && Guid.TryParse(guildId, out var guildGuid))
        {
            await Clients.Group(GetGroupName(guildGuid))
                .SendAsync("VoiceParticipantUpdated", new
                {
                    GuildId = guildId,
                    ChannelId = channelId,
                    UserId = updated.UserId,
                    ConnectionId = updated.ConnectionId,
                    Username = updated.Username,
                    IsMuted = updated.IsMuted,
                    IsDeafened = updated.IsDeafened,
                    IsSpeaking = updated.IsSpeaking
                });
        }
    }

    /// <summary>
    /// Updates the current user's speaking state (from local audio level analysis).
    /// Broadcasts VoiceParticipantUpdated so other clients can highlight the active speaker.
    /// </summary>
    public async Task SetVoiceSpeaking(string guildId, string channelId, bool isSpeaking)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return;

        var updated = _voiceState.UpdateSpeaking(guildId, channelId, Context.ConnectionId, isSpeaking);
        if (updated != null && Guid.TryParse(guildId, out var guildGuid))
        {
            await Clients.Group(GetGroupName(guildGuid))
                .SendAsync("VoiceParticipantUpdated", new
                {
                    GuildId = guildId,
                    ChannelId = channelId,
                    UserId = updated.UserId,
                    ConnectionId = updated.ConnectionId,
                    Username = updated.Username,
                    IsMuted = updated.IsMuted,
                    IsDeafened = updated.IsDeafened,
                    IsSpeaking = updated.IsSpeaking
                });
        }
    }

    /// <summary>
    /// Returns the list of participants in a voice channel.
    /// Call when joining or when displaying the voice channel UI.
    /// </summary>
    public Task<IReadOnlyList<object>> GetVoiceParticipants(string guildId, string channelId)
    {
        var userId = GetUserId();
        if (!userId.HasValue) return Task.FromResult<IReadOnlyList<object>>(Array.Empty<object>());

        var participants = _voiceState.GetParticipants(guildId, channelId);
        var dtos = participants.Select(p => (object)new
        {
            p.UserId,
            p.ConnectionId,
            p.Username,
            p.IsMuted,
            p.IsDeafened,
            p.IsSpeaking
        }).ToList();
        return Task.FromResult<IReadOnlyList<object>>(dtos);
    }

    /// <summary>
    /// Completes the WebRTC transport handshake with client DTLS parameters.
    /// Call when mediasoup-client send transport emits the "connect" event.
    /// </summary>
    /// <param name="transportId">The transport ID from JoinVoiceChannel.</param>
    /// <param name="dtlsParameters">Client DTLS parameters (role, fingerprints).</param>
    public async Task ConnectTransport(string transportId, object dtlsParameters)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
        {
            throw new HubException("Unauthorized.");
        }

        var dp = System.Text.Json.JsonSerializer.Deserialize<DtlsParametersPayload>(System.Text.Json.JsonSerializer.Serialize(dtlsParameters));
        if (dp == null || dp.Fingerprints == null)
        {
            throw new HubException("Invalid DTLS parameters.");
        }

        var coreDtls = new ChatApp.Core.Services.DtlsParameters(
            dp.Role ?? "client",
            dp.Fingerprints.Select(f => new ChatApp.Core.Services.DtlsFingerprint(f.Algorithm ?? "", f.Value ?? "")).ToList());

        await _voiceCoordinationService.ConnectTransportAsync(transportId, coreDtls, Context.ConnectionAborted);
    }

    /// <summary>
    /// Creates an audio/video producer on a transport.
    /// Call when mediasoup-client send transport emits the "produce" event.
    /// </summary>
    /// <param name="transportId">The transport ID.</param>
    /// <param name="kind">Media kind ("audio" or "video").</param>
    /// <param name="rtpParameters">RTP parameters from the produce event (will be serialized to JSON).</param>
    /// <returns>The producer ID to pass back to the produce callback.</returns>
    public async Task<string> CreateProducer(string transportId, string kind, object rtpParameters)
    {
        var userId = GetUserId();
        if (!userId.HasValue)
        {
            throw new HubException("Unauthorized.");
        }

        var json = System.Text.Json.JsonSerializer.Serialize(rtpParameters);
        return await _voiceCoordinationService.ProduceAsync(transportId, kind, json, Context.ConnectionAborted);
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
            m.EditedAt,
            m.AttachmentUrl
        }).ToList<object>();
    }

    private Guid? GetUserId()
    {
        var idClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }

    private static string GetGroupName(Guid guildId) => $"guild:{guildId:N}";
}
