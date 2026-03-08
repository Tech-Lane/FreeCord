using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ChatApp.Core.Services;
using ChatApp.Infra.Presence;
using StackExchange.Redis;

namespace ChatApp.Infra.Redis;

public static class RedisServiceExtensions
{
    public static IServiceCollection AddRedisPresence(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Redis")
            ?? configuration["Redis:Configuration"]
            ?? "localhost:6379";

        services.AddSingleton<IConnectionMultiplexer>(sp =>
        {
            var config = ConfigurationOptions.Parse(connectionString);
            return ConnectionMultiplexer.Connect(config);
        });

        services.AddSingleton<IPresenceService>(sp =>
        {
            var redis = sp.GetRequiredService<IConnectionMultiplexer>();
            var ttlStr = configuration["Redis:PresenceTtlSeconds"];
            var ttl = int.TryParse(ttlStr, out var val) ? val : 120;
            return new PresenceService(redis, ttl);
        });

        return services;
    }
}
