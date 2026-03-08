# FreeCord Backend - Multi-stage Dockerfile for ChatApp.Api
# Stage 1: Build the .NET 8 API and dependencies
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution/project files for restore (layer caching)
COPY ChatApp.Api/ChatApp.Api.csproj ChatApp.Api/
COPY ChatApp.Core/ChatApp.Core.csproj ChatApp.Core/
COPY ChatApp.Data/ChatApp.Data.csproj ChatApp.Data/
COPY ChatApp.Infra/ChatApp.Infra.csproj ChatApp.Infra/
COPY ChatApp.Realtime/ChatApp.Realtime.csproj ChatApp.Realtime/

# Restore dependencies
RUN dotnet restore ChatApp.Api/ChatApp.Api.csproj

# Copy all source code
COPY . .

# Build and publish the API (no self-contained; uses framework-dependent deployment)
RUN dotnet publish ChatApp.Api/ChatApp.Api.csproj -c Release -o /app/publish --no-restore

# Stage 2: Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Copy published output from build stage
COPY --from=build /app/publish .

# Create non-root user for security (best practice for internet-facing apps)
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser:appuser /app
USER appuser

# API listens on port 5000 (ASP.NET Core default)
EXPOSE 5000

# Configure ASP.NET Core to listen on all interfaces
ENV ASPNETCORE_URLS=http://+:5000

ENTRYPOINT ["dotnet", "ChatApp.Api.dll"]
