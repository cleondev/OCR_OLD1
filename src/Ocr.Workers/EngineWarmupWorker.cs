namespace Ocr.Workers;

using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Ocr.Core;
using Ocr.Core.Abstractions;
using Serilog;

public sealed class EngineWarmupWorker : BackgroundService
{
    private readonly ILogger _logger;
    private readonly IOcrEngineFactory _engineFactory;

    public EngineWarmupWorker(ILogger logger, IOcrEngineFactory engineFactory)
    {
        _logger = logger.ForContext<EngineWarmupWorker>();
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
            _logger.Information("Warming up FAST OCR engine");
            _engineFactory.GetEngine(OcrMode.Fast);
            _logger.Information("Warming up ENHANCED OCR engine");
            _engineFactory.GetEngine(OcrMode.Enhanced);
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Engine warm-up encountered an error");
        }
    }
}
