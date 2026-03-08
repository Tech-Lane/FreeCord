namespace ChatApp.Core.Entities;

public class Message
{
    public Guid Id { get; set; }
    public Guid ChannelId { get; set; }
    public Guid AuthorId { get; set; }
    public string Content { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime? EditedAt { get; set; }

    public Channel Channel { get; set; } = null!;
    public User Author { get; set; } = null!;
}
