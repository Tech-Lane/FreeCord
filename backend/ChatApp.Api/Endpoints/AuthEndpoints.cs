using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChatApp.Core.Entities;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace ChatApp.Api;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Authentication");

        group.MapPost("/register", Register).WithName("Register");
        group.MapPost("/login", Login).WithName("Login");
    }

    private static async Task<IResult> Register(
        [FromBody] RegisterRequest request,
        ChatDbContext db,
        IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest(new { error = "Username, email, and password are required." });
        }

        // Server must be initialized (first admin created) before open registration
        if (!await db.Users.AnyAsync())
        {
            return Results.BadRequest(new { error = "Server is not yet initialized. Please complete first-time setup." });
        }

        if (await db.Users.AnyAsync(u => u.Username == request.Username))
        {
            return Results.Conflict(new { error = "Username already exists." });
        }

        if (await db.Users.AnyAsync(u => u.Email == request.Email))
        {
            return Results.Conflict(new { error = "Email already registered." });
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = request.Username.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            PasswordHash = passwordHash,
            CreatedAt = DateTime.UtcNow,
            IsServerAdmin = false,
            IsApproved = false
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        // New registrations require admin approval; do not issue token
        return Results.Created("/api/auth/login", new
        {
            message = "Registration successful. Your account is pending admin approval.",
            pendingApproval = true
        });
    }

    private static async Task<IResult> Login(
        [FromBody] LoginRequest request,
        ChatDbContext db,
        IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest(new { error = "Email and password are required." });
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email.Trim().ToLowerInvariant());
        if (user == null)
        {
            return Results.Unauthorized();
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Results.Unauthorized();
        }

        if (!user.IsApproved)
        {
            return Results.Json(new { error = "Your account is pending admin approval." }, statusCode: 403);
        }

        user.LastSeenAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var token = GenerateJwtToken(user, config);
        return Results.Ok(new { token, userId = user.Id, username = user.Username });
    }

    /// <summary>
    /// Generates a JWT for the given user. Exposed for SetupEndpoints to use when creating the first admin.
    /// </summary>
    public static string GenerateJwtToken(User user, IConfiguration config)
    {
        var key = config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required");
        var keyBytes = Encoding.UTF8.GetBytes(key);
        var expirationMinutes = int.TryParse(config["Jwt:ExpirationMinutes"], out var mins) ? mins : 60;

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Email, user.Email)
        };
        if (user.IsServerAdmin)
        {
            claims.Add(new Claim("IsServerAdmin", "true"));
        }

        var creds = new SigningCredentials(new SymmetricSecurityKey(keyBytes), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expirationMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public record RegisterRequest(string Username, string Email, string Password);
public record LoginRequest(string Email, string Password);
