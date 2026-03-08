using System.Text;
using ChatApp.Api;
using ChatApp.Data;
using ChatApp.Data.Permissions;
using ChatApp.Core.Repositories;
using ChatApp.Data.Repositories;
using ChatApp.Infra.Redis;
using ChatApp.Infra.Voice;
using ChatApp.Realtime;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS: allow Angular dev server and Tauri app; credentials required for JWT WebSocket auth
// Include both localhost and 127.0.0.1 - browser may send either depending on how the page was opened
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:1420",
                "http://localhost:4200",
                "http://127.0.0.1:4200",
                "tauri://localhost"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Database
builder.Services.AddDbContext<ChatDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Redis presence
builder.Services.AddRedisPresence(builder.Configuration);

// Voice coordination (gRPC client to Node.js voice service)
builder.Services.AddVoiceCoordination(builder.Configuration);

// Repositories
builder.Services.AddScoped<IMessageRepository, MessageRepository>();

// Permission service (role-based guild permissions)
builder.Services.AddScoped<ChatApp.Core.Services.IPermissionService, PermissionService>();

// SignalR (VoiceChannelState is singleton for in-memory voice participant tracking)
builder.Services.AddSingleton<ChatApp.Realtime.VoiceChannelState>();
builder.Services.AddSignalR();

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required");
var jwtKeyBytes = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
        ClockSkew = TimeSpan.Zero
    };

    // SignalR: JWT passed via access_token query string for WebSocket connections
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var path = context.HttpContext.Request.Path;
            if (path.StartsWithSegments("/hubs/chat"))
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken))
                    context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline (CORS before auth so preflight and credentials work)
app.UseCors();

// In Development: surface exception details in 500 responses to help debug
if (app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(errApp =>
    {
        errApp.Run(async context =>
        {
            var ex = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            var msg = ex?.Message ?? "An error occurred";
            var stack = ex?.StackTrace ?? "";
            await context.Response.WriteAsJsonAsync(new { error = msg, detail = stack });
        });
    });
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();

// Serve uploaded files from /uploads (e.g. /uploads/xyz.png for chat attachments)
var uploadsPath = Path.Combine(app.Environment.ContentRootPath, "uploads");
if (!Directory.Exists(uploadsPath)) Directory.CreateDirectory(uploadsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

// Auth endpoints
app.MapAuthEndpoints();

// First-time setup (unauthenticated)
app.MapSetupEndpoints();

// Server admin (approve/deny registrations)
app.MapAdminEndpoints();

// Guild, channel, and message REST endpoints
app.MapGuildEndpoints();

// User profile and theme endpoints
app.MapUserEndpoints();

// Invite endpoints (create invite, join via invite)
app.MapInviteEndpoints();

// Media upload endpoints (chat attachments)
app.MapMediaEndpoints();

// SignalR hub
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
