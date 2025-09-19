namespace Ocr.Workers;

using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Ocr.Core;
using Ocr.Core.Abstractions;

public sealed class EngineWarmupWorker : BackgroundService
{
    private readonly ILogger<EngineWarmupWorker> _logger;
    private readonly IOcrEngineFactory _engineFactory;

    public EngineWarmupWorker(ILogger<EngineWarmupWorker> logger, IOcrEngineFactory engineFactory)
    {
        _logger = logger;
        _engineFactory = engineFactory;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        return Task.Run(() => WarmupEngines(stoppingToken), stoppingToken);
    }

    private void WarmupEngines(CancellationToken token)
    {
        try
        {
            _logger.LogInformation("Warming up FAST OCR engine");
            _engineFactory.GetEngine(OcrMode.Fast);
            _logger.LogInformation("Warming up ENHANCED OCR engine");
            _engineFactory.GetEngine(OcrMode.Enhanced);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Engine warm-up encountered an error");
        }
    }
}
