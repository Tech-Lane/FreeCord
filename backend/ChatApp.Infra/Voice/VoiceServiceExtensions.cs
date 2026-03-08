using ChatApp.Core.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ChatApp.Infra.Voice;

/// <summary>
/// Extension methods for registering voice coordination services with the DI container.
/// </summary>
public static class VoiceServiceExtensions
{
    /// <summary>
    /// Registers the VoiceCoordinationService and related dependencies for communicating
    /// with the Node.js voice microservice via gRPC.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">Configuration containing Voice:Address.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddVoiceCoordination(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<IVoiceCoordinationService>(sp =>
            new VoiceCoordinationService(configuration));

        return services;
    }
}
