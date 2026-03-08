using ChatApp.Core.Services;
using StackExchange.Redis;

namespace ChatApp.Infra.Presence;

public class PresenceService : IPresenceService
{
    private const string KeyPrefix = "presence:user:";
    private const int DefaultTtlSeconds = 120; // Consider offline after 2 minutes of no heartbeat

    private readonly IConnectionMultiplexer _redis;
    private readonly TimeSpan _ttl;

    public PresenceService(IConnectionMultiplexer redis, int ttlSeconds = DefaultTtlSeconds)
    {
        _redis = redis ?? throw new ArgumentNullException(nameof(redis));
        _ttl = TimeSpan.FromSeconds(ttlSeconds);
    }

    public async Task SetOnlineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var key = KeyPrefix + userId.ToString("N");
        await db.StringSetAsync(key, "1", _ttl);
    }

    public async Task SetOfflineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var key = KeyPrefix + userId.ToString("N");
        await db.KeyDeleteAsync(key);
    }

    public async Task<bool> IsOnlineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var db = _redis.GetDatabase();
        var key = KeyPrefix + userId.ToString("N");
        var exists = await db.KeyExistsAsync(key);
        return exists;
    }
}
