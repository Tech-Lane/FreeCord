namespace ChatApp.Core.Services;

public interface IPresenceService
{
    Task SetOnlineAsync(Guid userId, CancellationToken cancellationToken = default);
    Task SetOfflineAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> IsOnlineAsync(Guid userId, CancellationToken cancellationToken = default);
}
