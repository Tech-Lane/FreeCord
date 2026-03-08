using System.Security.Claims;
using ChatApp.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Api;

/// <summary>
/// Server admin endpoints. Requires IsServerAdmin on the authenticated user.
/// Used to approve or deny pending user registrations.
/// </summary>
public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization();

        group.MapGet("/pending-users", GetPendingUsers).WithName("GetPendingUsers");
        group.MapPost("/approve-user/{userId:guid}", ApproveUser).WithName("ApproveUser");
        group.MapPost("/deny-user/{userId:guid}", DenyUser).WithName("DenyUser");
    }

    /// <summary>
    /// Returns all users pending approval. Admin only.
    /// </summary>
    private static async Task<IResult> GetPendingUsers(
        ClaimsPrincipal user,
        ChatDbContext db)
    {
        if (!IsServerAdmin(user))
            return Results.Forbid();

        var pending = await db.Users
            .AsNoTracking()
            .Where(u => !u.IsApproved)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new
            {
                id = u.Id,
                username = u.Username,
                email = u.Email,
                createdAt = u.CreatedAt
            })
            .ToListAsync();

        return Results.Ok(pending);
    }

    /// <summary>
    /// Approves a pending user so they can log in. Admin only.
    /// </summary>
    private static async Task<IResult> ApproveUser(
        Guid userId,
        ClaimsPrincipal user,
        ChatDbContext db)
    {
        if (!IsServerAdmin(user))
            return Results.Forbid();

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (target == null)
            return Results.NotFound();

        if (target.IsApproved)
            return Results.BadRequest(new { error = "User is already approved." });

        target.IsApproved = true;
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "User approved." });
    }

    /// <summary>
    /// Denies a pending user (deletes their account). Admin only.
    /// </summary>
    private static async Task<IResult> DenyUser(
        Guid userId,
        ClaimsPrincipal user,
        ChatDbContext db)
    {
        if (!IsServerAdmin(user))
            return Results.Forbid();

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (target == null)
            return Results.NotFound();

        if (target.IsApproved)
            return Results.BadRequest(new { error = "Cannot deny an approved user." });

        db.Users.Remove(target);
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "User denied and removed." });
    }

    private static bool IsServerAdmin(ClaimsPrincipal user)
    {
        return user.HasClaim("IsServerAdmin", "true");
    }
}
