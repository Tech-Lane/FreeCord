namespace ChatApp.Core.Entities;

public class Channel
{
    public Guid Id { get; set; }
    public Guid GuildId { get; set; }
    public string Name { get; set; } = null!;
    public ChannelType Type { get; set; }
    public int Position { get; set; }
    public DateTime CreatedAt { get; set; }

    public Guild Guild { get; set; } = null!;
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
