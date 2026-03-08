using ChatApp.Core.Entities;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Api;

/// <summary>
/// First-time setup endpoints. Used when the server has no users yet.
/// Enables creating the initial admin account before registration is open.
/// </summary>
public static class SetupEndpoints
{
    public static void MapSetupEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/setup").WithTags("Setup");

        group.MapGet("/status", GetSetupStatus).WithName("GetSetupStatus");
        group.MapPost("/initialize", InitializeSetup).WithName("InitializeSetup");
    }

    /// <summary>
    /// Returns whether the server has been initialized (has at least one user).
    /// Client uses this to show setup page on first deployment.
    /// </summary>
    private static async Task<IResult> GetSetupStatus(ChatDbContext db)
    {
        var isInitialized = await db.Users.AnyAsync();
        return Results.Ok(new { isInitialized });
    }

    /// <summary>
    /// Creates the first admin user. Only allowed when no users exist.
    /// The created user is server admin and auto-approved.
    /// </summary>
    private static async Task<IResult> InitializeSetup(
        [FromBody] InitializeSetupRequest request,
        ChatDbContext db,
        IConfiguration config)
    {
        if (await db.Users.AnyAsync())
        {
            return Results.BadRequest(new { error = "Server is already initialized." });
        }

        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest(new { error = "Username, email, and password are required." });
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = request.Username.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            PasswordHash = passwordHash,
            CreatedAt = DateTime.UtcNow,
            IsServerAdmin = true,
            IsApproved = true
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var token = AuthEndpoints.GenerateJwtToken(user, config);
        return Results.Created("/api/auth/login", new { token, userId = user.Id, username = user.Username });
    }
}

/// <summary>
/// Request body for POST /api/setup/initialize.
/// </summary>
public record InitializeSetupRequest(string Username, string Email, string Password);
