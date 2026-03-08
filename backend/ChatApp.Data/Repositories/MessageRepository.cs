using ChatApp.Core.Repositories;
using Dapper;
using Microsoft.Extensions.Configuration;
using Npgsql;

namespace ChatApp.Data.Repositories;

public class MessageRepository : IMessageRepository
{
    private readonly IConfiguration _configuration;

    public MessageRepository(IConfiguration configuration)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
    }

    public async Task<IReadOnlyList<ChannelMessageDto>> GetLast50ByChannelAsync(Guid channelId, CancellationToken cancellationToken = default)
    {
        var connectionString = _configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("DefaultConnection is not configured.");

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            SELECT m."Id", m."ChannelId", m."AuthorId", u."Username" AS AuthorUsername,
                   m."Content", m."CreatedAt", m."EditedAt", m."AttachmentUrl"
            FROM "Messages" m
            INNER JOIN "Users" u ON m."AuthorId" = u."Id"
            WHERE m."ChannelId" = @ChannelId
            ORDER BY m."CreatedAt" DESC
            LIMIT 50
            """;

        var results = await connection.QueryAsync<ChannelMessageDto>(sql, new { ChannelId = channelId });
        var list = results.Reverse().ToList(); // Oldest first for chronological order
        return list;
    }
}
