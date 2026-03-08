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

    // SignalR: JWT can be passed via query string for WebSocket connections
    options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline
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
