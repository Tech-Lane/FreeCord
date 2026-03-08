using System.Security.Claims;
using ChatApp.Core.Entities;
using ChatApp.Core.Services;
using Microsoft.AspNetCore.Http;

namespace ChatApp.Api.Authorization;

/// <summary>
/// Endpoint filter for Minimal API that enforces guild permission checks.
/// Requires the user to have the specified permission in the guild from the route.
/// Resolves guildId from route values; use with routes like /api/guilds/{guildId}/...
/// </summary>
public class RequirePermissionFilter : IEndpointFilter
{
    private readonly Permissions _requiredPermission;
    private const string GuildIdKey = "guildId";

    private RequirePermissionFilter(Permissions requiredPermission)
    {
        _requiredPermission = requiredPermission;
    }

    /// <summary>Creates a filter that requires the given permission.</summary>
    public static RequirePermissionFilter Create(Permissions permission) => new(permission);

    /// <inheritdoc />
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var user = context.HttpContext.User;
        if (user?.Identity?.IsAuthenticated != true)
            return Results.Unauthorized();

        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        if (!context.HttpContext.Request.RouteValues.TryGetValue(GuildIdKey, out var guildIdObj))
            return Results.BadRequest(new { error = "Guild ID required for permission check." });

        if (guildIdObj is not string guildIdStr || !Guid.TryParse(guildIdStr, out var guildId))
            return Results.BadRequest(new { error = "Invalid guild ID." });

        var permissionService = context.HttpContext.RequestServices.GetService(typeof(IPermissionService)) as IPermissionService
            ?? throw new InvalidOperationException("IPermissionService not registered.");

        var hasPermission = await permissionService.HasPermissionAsync(userId, guildId, _requiredPermission);
        if (!hasPermission)
            return Results.Json(new { error = "Insufficient permissions." }, statusCode: StatusCodes.Status403Forbidden);

        return await next(context);
    }
}
