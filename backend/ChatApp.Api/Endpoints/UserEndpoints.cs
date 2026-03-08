using System.Security.Claims;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Api;

/// <summary>
/// REST endpoints for the authenticated user's profile and theme preferences.
/// Used by the Angular client for theme customization UI.
/// </summary>
public static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        group.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser");
        group.MapPut("/me/theme", UpdateTheme).WithName("UpdateTheme");
    }

    /// <summary>
    /// Returns the authenticated user's profile including CustomThemeCss.
    /// Excludes sensitive fields (PasswordHash, Email).
    /// </summary>
    private static async Task<IResult> GetCurrentUser(
        ClaimsPrincipal user,
        ChatDbContext db)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        var entity = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (entity == null) return Results.NotFound();

        return Results.Ok(new
        {
            id = entity.Id,
            username = entity.Username,
            customThemeCss = entity.CustomThemeCss ?? string.Empty
        });
    }

    /// <summary>
    /// Updates the authenticated user's CustomThemeCss.
    /// Accepts plain CSS string; client sanitizes before injection.
    /// Max 64KB to mitigate DoS.
    /// </summary>
    private static async Task<IResult> UpdateTheme(
        [FromBody] UpdateThemeRequest request,
        ClaimsPrincipal user,
        ChatDbContext db)
    {
        var userId = GetUserId(user);
        if (userId == null) return Results.Unauthorized();

        /* 64KB limit matches client-side ThemeService max length (security consistency) */
        const int maxLength = 64 * 1024;
        var css = request.CustomThemeCss ?? string.Empty;
        if (css.Length > maxLength)
        {
            return Results.BadRequest(new { error = $"Custom theme CSS must not exceed {maxLength} characters." });
        }

        var entity = await db.Users.FirstOrDefaultAsync(u => u.Id == userId.Value);
        if (entity == null) return Results.NotFound();

        entity.CustomThemeCss = string.IsNullOrWhiteSpace(css) ? null : css.Trim();
        await db.SaveChangesAsync();

        return Results.Ok(new { customThemeCss = entity.CustomThemeCss ?? string.Empty });
    }

    private static Guid? GetUserId(ClaimsPrincipal user)
    {
        var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(idClaim, out var id) ? id : null;
    }
}

/// <summary>
/// Request body for PUT /api/users/me/theme.
/// </summary>
public record UpdateThemeRequest(string? CustomThemeCss);
