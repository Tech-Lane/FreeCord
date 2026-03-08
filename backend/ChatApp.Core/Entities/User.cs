namespace ChatApp.Core.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Username { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }

    /// <summary>
    /// Optional custom CSS for theming when viewing this user's profile or their servers.
    /// Stored as plain text; must be sanitized client-side before injection to prevent XSS.
    /// </summary>
    public string? CustomThemeCss { get; set; }

    /// <summary>
    /// Whether this user is a server administrator. Admins can approve/deny new registrations.
    /// </summary>
    public bool IsServerAdmin { get; set; }

    /// <summary>
    /// Whether the user has been approved by an admin. Pending users cannot log in.
    /// First admin (setup) is auto-approved; subsequent registrations require approval.
    /// </summary>
    public bool IsApproved { get; set; }

    public ICollection<GuildMember> GuildMemberships { get; set; } = new List<GuildMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
