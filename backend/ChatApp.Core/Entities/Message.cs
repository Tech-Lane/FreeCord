namespace ChatApp.Core.Entities;

/// <summary>
/// Chat message entity. Supports optional file/image attachments via AttachmentUrl.
/// </summary>
public class Message
{
    public Guid Id { get; set; }
    public Guid ChannelId { get; set; }
    public Guid AuthorId { get; set; }
    public string Content { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime? EditedAt { get; set; }

    /// <summary>
    /// Optional relative URL to an uploaded attachment (image or file).
    /// Served from /uploads. Null when message has no attachment.
    /// </summary>
    public string? AttachmentUrl { get; set; }

    public Channel Channel { get; set; } = null!;
    public User Author { get; set; } = null!;
}
