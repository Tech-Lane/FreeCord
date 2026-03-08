using Microsoft.AspNetCore.Mvc;

namespace ChatApp.Api;

/// <summary>
/// REST endpoints for media uploads (chat attachments).
/// Files are stored securely in a local /uploads directory.
/// All endpoints require JWT authentication.
/// </summary>
public static class MediaEndpoints
{
    /// <summary>Allowed image extensions for in-chat preview. Others render as download links.</summary>
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"
    };

    /// <summary>Allowed file extensions. Restrict to prevent abuse.</summary>
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
        ".pdf", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx",
        ".zip", ".tar", ".gz", ".7z", ".json", ".xml", ".csv"
    };

    /// <summary>Maximum file size in bytes (10 MB).</summary>
    private const long MaxFileSizeBytes = 10 * 1024 * 1024;

    public static void MapMediaEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/media").WithTags("Media").RequireAuthorization();
        group.MapPost("/upload", Upload)
            .DisableAntiforgery()
            .Accepts<IFormFile>("multipart/form-data")
            .Produces<UploadResponse>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
    }

    /// <summary>
    /// Uploads a file and returns its relative URL for use in message attachments.
    /// Validates file type and size. Stores files in /uploads with a unique name.
    /// </summary>
    private static async Task<IResult> Upload(
        [FromForm] IFormFile? file,
        [FromServices] IWebHostEnvironment env,
        [FromServices] ILogger<MediaUploadHandler> logger,
        CancellationToken ct)
    {
        if (file == null || file.Length == 0)
        {
            return Results.BadRequest(new { error = "No file provided." });
        }

        if (file.Length > MaxFileSizeBytes)
        {
            return Results.BadRequest(new { error = $"File size exceeds maximum allowed ({MaxFileSizeBytes / (1024 * 1024)} MB)." });
        }

        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext) || !AllowedExtensions.Contains(ext))
        {
            return Results.BadRequest(new { error = "File type not allowed." });
        }

        // Prevent path traversal: only use safe filename
        var safeFileName = SanitizeFileName(Path.GetFileNameWithoutExtension(file.FileName))
            + "_" + Guid.NewGuid().ToString("N")[..8]
            + ext;

        var uploadsPath = Path.Combine(env.ContentRootPath, "uploads");
        Directory.CreateDirectory(uploadsPath);

        var fullPath = Path.Combine(uploadsPath, safeFileName);

        // Extra safety: ensure final path is under uploads directory
        var uploadsFull = Path.GetFullPath(uploadsPath);
        var resolvedFull = Path.GetFullPath(fullPath);
        if (!resolvedFull.StartsWith(uploadsFull, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("Rejected upload due to path traversal attempt: {Name}", file.FileName);
            return Results.BadRequest(new { error = "Invalid file name." });
        }

        try
        {
            await using (var stream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await file.CopyToAsync(stream, ct);
            }

            var relativeUrl = "/uploads/" + safeFileName;
            logger.LogInformation("Uploaded file: {FileName} -> {Url}", file.FileName, relativeUrl);

            return Results.Ok(new UploadResponse
            {
                Url = relativeUrl,
                IsImage = ImageExtensions.Contains(ext),
                OriginalFileName = Path.GetFileName(file.FileName)
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to save upload: {Name}", file.FileName);
            return Results.Json(new { error = "Failed to save file." }, statusCode: 500);
        }
    }

    /// <summary>Sanitizes filename to prevent path traversal and invalid characters.</summary>
    private static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "file";
        var invalid = Path.GetInvalidFileNameChars();
        var sanitized = string.Join("_", name.Split(invalid, StringSplitOptions.RemoveEmptyEntries));
        return string.IsNullOrEmpty(sanitized) ? "file" : sanitized[..Math.Min(sanitized.Length, 64)];
    }
}

/// <summary>Logger category for media upload endpoints.</summary>
internal sealed class MediaUploadHandler { }

/// <summary>Response returned after a successful upload.</summary>
public record UploadResponse
{
    /// <summary>Relative URL (e.g. /uploads/xyz.png) for use in message AttachmentUrl.</summary>
    public string Url { get; init; } = null!;

    /// <summary>Whether the file is an image (for client to render as img vs download link).</summary>
    public bool IsImage { get; init; }

    /// <summary>Original filename for display and download.</summary>
    public string OriginalFileName { get; init; } = null!;
}
