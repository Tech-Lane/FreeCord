using System.Collections.Concurrent;

namespace ChatApp.Realtime;

/// <summary>
/// Represents a participant in a voice channel.
/// Used for broadcasting to clients so they can render avatars and mute/speaking indicators.
/// </summary>
public sealed record VoiceParticipant(
    Guid UserId,
    string ConnectionId,
    string Username,
    bool IsMuted,
    bool IsDeafened,
    bool IsSpeaking);

/// <summary>
/// In-memory state for voice channel participants.
/// Tracks who is in which voice channel and their mute/deafen/speaking state.
/// Broadcasts changes via ChatHub; this service only holds state.
/// </summary>
public sealed class VoiceChannelState
{
    /// <summary>Key: (guildId, channelId). Value: participants by ConnectionId.</summary>
    private readonly ConcurrentDictionary<(string, string), ConcurrentDictionary<string, VoiceParticipant>> _rooms = new();

    /// <summary>ConnectionId -> (guildId, channelId) for quick removal on disconnect.</summary>
    private readonly ConcurrentDictionary<string, (string GuildId, string ChannelId)> _connectionToRoom = new();

    /// <summary>
    /// Adds a participant to a voice channel. Call when JoinVoiceChannel succeeds.
    /// </summary>
    public VoiceParticipant AddParticipant(string guildId, string channelId, Guid userId, string connectionId, string username)
    {
        var key = (guildId, channelId);
        var room = _rooms.GetOrAdd(key, _ => new ConcurrentDictionary<string, VoiceParticipant>());

        var participant = new VoiceParticipant(userId, connectionId, username, IsMuted: false, IsDeafened: false, IsSpeaking: false);
        room[connectionId] = participant;
        _connectionToRoom[connectionId] = (guildId, channelId);
        return participant;
    }

    /// <summary>Removes a participant by connection ID. Call on LeaveVoiceChannel or Disconnect.</summary>
    public VoiceParticipant? RemoveByConnection(string connectionId)
    {
        if (!_connectionToRoom.TryRemove(connectionId, out var roomKey))
            return null;

        if (!_rooms.TryGetValue(roomKey, out var room))
            return null;

        room.TryRemove(connectionId, out var participant);

        if (room.IsEmpty)
            _rooms.TryRemove(roomKey, out _);

        return participant;
    }

    /// <summary>Updates mute state for a participant.</summary>
    public VoiceParticipant? UpdateMute(string guildId, string channelId, string connectionId, bool isMuted)
    {
        return UpdateParticipant(guildId, channelId, connectionId, p => p with { IsMuted = isMuted });
    }

    /// <summary>Updates deafen state for a participant.</summary>
    public VoiceParticipant? UpdateDeafen(string guildId, string channelId, string connectionId, bool isDeafened)
    {
        return UpdateParticipant(guildId, channelId, connectionId, p => p with { IsDeafened = isDeafened });
    }

    /// <summary>Updates speaking state for a participant.</summary>
    public VoiceParticipant? UpdateSpeaking(string guildId, string channelId, string connectionId, bool isSpeaking)
    {
        return UpdateParticipant(guildId, channelId, connectionId, p => p with { IsSpeaking = isSpeaking });
    }

    /// <summary>Gets all participants in a voice channel.</summary>
    public IReadOnlyList<VoiceParticipant> GetParticipants(string guildId, string channelId)
    {
        if (!_rooms.TryGetValue((guildId, channelId), out var room))
            return Array.Empty<VoiceParticipant>();

        return room.Values.ToList();
    }

    /// <summary>Gets the room key for a connection (if any).</summary>
    public (string GuildId, string ChannelId)? GetRoomForConnection(string connectionId)
    {
        return _connectionToRoom.TryGetValue(connectionId, out var v) ? v : null;
    }

    private VoiceParticipant? UpdateParticipant(
        string guildId,
        string channelId,
        string connectionId,
        Func<VoiceParticipant, VoiceParticipant> updater)
    {
        if (!_rooms.TryGetValue((guildId, channelId), out var room))
            return null;

        if (!room.TryGetValue(connectionId, out var current))
            return null;

        var updated = updater(current);
        room[connectionId] = updated;
        return updated;
    }
}
