namespace ChatApp.Core.Entities;

public class Guild
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public Guid OwnerId { get; set; }
    public DateTime CreatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public ICollection<GuildMember> Members { get; set; } = new List<GuildMember>();
    public ICollection<Channel> Channels { get; set; } = new List<Channel>();
    public ICollection<Role> Roles { get; set; } = new List<Role>();
    public ICollection<Invite> Invites { get; set; } = new List<Invite>();
}
