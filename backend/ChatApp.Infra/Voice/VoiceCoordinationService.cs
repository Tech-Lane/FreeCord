using System.Net.Http;
using ChatApp.Core.Services;
using ChatApp.Infra.Voice;
using Grpc.Net.Client;
using Microsoft.Extensions.Configuration;

namespace ChatApp.Infra.Voice;

/// <summary>
/// Coordinates with the Node.js voice service via gRPC to provision WebRTC transports.
/// When a user requests to join a voice channel, this service calls CreateWebRtcTransport
/// on the voice microservice and maps the response to domain DTOs for the client.
/// </summary>
public sealed class VoiceCoordinationService : IVoiceCoordinationService
{
    private readonly GrpcChannel _channel;

    /// <summary>
    /// Initializes the service with a gRPC channel to the voice service.
    /// </summary>
    /// <param name="configuration">Configuration containing Voice:Address or Voice:GrpcAddress.</param>
    public VoiceCoordinationService(IConfiguration configuration)
    {
        var address = configuration["Voice:Address"]
            ?? configuration["Voice:GrpcAddress"]
            ?? "http://localhost:50051";

        // Required for gRPC over HTTP (no TLS) to Node.js voice service; typically used for localhost/dev.
        AppContext.SetSwitch("System.Net.Http.SocketsHttpHandler.Http2UnencryptedSupport", true);

        _channel = GrpcChannel.ForAddress(address, new GrpcChannelOptions
        {
            HttpHandler = new SocketsHttpHandler()
        });
    }

    /// <inheritdoc />
    public async Task<string> GetRouterRtpCapabilitiesAsync(CancellationToken cancellationToken = default)
    {
        var client = new VoiceService.VoiceServiceClient(_channel);
        var response = await client.GetRouterRtpCapabilitiesAsync(
            new GetRouterRtpCapabilitiesRequest(),
            cancellationToken: cancellationToken);
        return response.RouterRtpCapabilitiesJson ?? "{}";
    }

    /// <inheritdoc />
    public async Task<VoiceConnectionDetails> ProvisionWebRtcTransportAsync(
        string? appData = null,
        CancellationToken cancellationToken = default)
    {
        var client = new VoiceService.VoiceServiceClient(_channel);
        var request = new CreateWebRtcTransportRequest();
        if (!string.IsNullOrEmpty(appData))
        {
            request.AppData = appData;
        }

        var response = await client.CreateWebRtcTransportAsync(request, cancellationToken: cancellationToken);

        if (response.IceParameters == null)
        {
            throw new InvalidOperationException("Voice service returned null ICE parameters.");
        }

        if (response.DtlsParameters == null)
        {
            throw new InvalidOperationException("Voice service returned null DTLS parameters.");
        }

        var iceParams = MapIceParameters(response.IceParameters);
        var iceCandidates = response.IceCandidates
            .Select(MapIceCandidate)
            .ToList();
        var dtlsParams = MapDtlsParameters(response.DtlsParameters);

        return new VoiceConnectionDetails(
            response.Id,
            iceParams,
            iceCandidates,
            dtlsParams);
    }

    /// <inheritdoc />
    public async Task ConnectTransportAsync(
        string transportId,
        ChatApp.Core.Services.DtlsParameters dtlsParameters,
        CancellationToken cancellationToken = default)
    {
        var client = new VoiceService.VoiceServiceClient(_channel);
        var request = new ConnectTransportRequest
        {
            TransportId = transportId,
            DtlsParameters = new ChatApp.Infra.Voice.DtlsParameters
            {
                Role = dtlsParameters.Role,
                Fingerprints = { dtlsParameters.Fingerprints.Select(f => new global::ChatApp.Infra.Voice.DtlsFingerprint { Algorithm = f.Algorithm, Value = f.Value }) }
            }
        };
        await client.ConnectTransportAsync(request, cancellationToken: cancellationToken);
    }

    /// <inheritdoc />
    public async Task<string> ProduceAsync(
        string transportId,
        string kind,
        string rtpParametersJson,
        CancellationToken cancellationToken = default)
    {
        var client = new VoiceService.VoiceServiceClient(_channel);
        var request = new ProduceRequest
        {
            TransportId = transportId,
            Kind = kind,
            RtpParametersJson = rtpParametersJson
        };
        var response = await client.ProduceAsync(request, cancellationToken: cancellationToken);
        return response.ProducerId ?? string.Empty;
    }

    private static ChatApp.Core.Services.IceParameters MapIceParameters(global::ChatApp.Infra.Voice.IceParameters proto)
    {
        return new ChatApp.Core.Services.IceParameters(
            proto.UsernameFragment,
            proto.Password,
            proto.IceLite);
    }

    private static ChatApp.Core.Services.IceCandidate MapIceCandidate(global::ChatApp.Infra.Voice.IceCandidate proto)
    {
        return new ChatApp.Core.Services.IceCandidate(
            proto.Foundation,
            proto.Priority,
            proto.Ip,
            proto.Port,
            proto.Type,
            proto.Protocol,
            string.IsNullOrEmpty(proto.Address) ? null : proto.Address,
            string.IsNullOrEmpty(proto.TcpType) ? null : proto.TcpType);
    }

    private static ChatApp.Core.Services.DtlsParameters MapDtlsParameters(global::ChatApp.Infra.Voice.DtlsParameters proto)
    {
        var fingerprints = proto.Fingerprints
            .Select(f => new ChatApp.Core.Services.DtlsFingerprint(f.Algorithm, f.Value))
            .ToList();
        return new ChatApp.Core.Services.DtlsParameters(proto.Role, fingerprints);
    }
}
