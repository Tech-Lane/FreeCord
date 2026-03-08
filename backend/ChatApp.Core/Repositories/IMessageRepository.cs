namespace ChatApp.Core.Repositories;

public interface IMessageRepository
{
    Task<IReadOnlyList<ChannelMessageDto>> GetLast50ByChannelAsync(Guid channelId, CancellationToken cancellationToken = default);
}

public record ChannelMessageDto(
    Guid Id,
    Guid ChannelId,
    Guid AuthorId,
    string AuthorUsername,
    string Content,
    DateTime CreatedAt,
    DateTime? EditedAt);
