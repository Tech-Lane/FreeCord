namespace ChatApp.Core.Entities;

public class GuildMember
{
    public Guid GuildId { get; set; }
    public Guid UserId { get; set; }
    public string? Nickname { get; set; }
    public DateTime JoinedAt { get; set; }

    public Guild Guild { get; set; } = null!;
    public User User { get; set; } = null!;
}
