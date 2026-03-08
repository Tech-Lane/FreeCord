namespace ChatApp.Core.Services;

/// <summary>
/// Coordinates with the Node.js voice service to provision WebRTC transports.
/// When a user requests to join a voice channel, this service calls the voice
/// microservice via gRPC to create transport slots and returns connection details.
/// </summary>
public interface IVoiceCoordinationService
{
    /// <summary>
    /// Provisions a WebRTC transport slot from the voice service and returns
    /// the connection parameters needed for the client to establish a WebRTC connection.
    /// </summary>
    /// <param name="appData">Optional application data to associate with the transport (e.g., channelId).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Connection details including transport id, ICE parameters, ICE candidates, and DTLS parameters.</returns>
    Task<VoiceConnectionDetails> ProvisionWebRtcTransportAsync(
        string? appData = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// WebRTC transport connection details returned by the voice service.
/// Clients use these to establish a peer connection with Mediasoup.
/// </summary>
public record VoiceConnectionDetails(
    string TransportId,
    IceParameters IceParameters,
    IReadOnlyList<IceCandidate> IceCandidates,
    DtlsParameters DtlsParameters);

/// <summary>
/// ICE credentials for WebRTC connection establishment.
/// </summary>
public record IceParameters(
    string UsernameFragment,
    string Password,
    bool IceLite);

/// <summary>
/// ICE candidate for NAT traversal.
/// </summary>
public record IceCandidate(
    string Foundation,
    int Priority,
    string Ip,
    int Port,
    string Type,
    string Protocol,
    string? Address,
    string? TcpType);

/// <summary>
/// DTLS parameters for secure WebRTC transport.
/// </summary>
public record DtlsParameters(
    string Role,
    IReadOnlyList<DtlsFingerprint> Fingerprints);

/// <summary>
/// DTLS certificate fingerprint.
/// </summary>
public record DtlsFingerprint(
    string Algorithm,
    string Value);
