namespace Ocr.Engines;

using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using Microsoft.ML.OnnxRuntime;
using Ocr.Core;
using Ocr.Core.Abstractions;
using Ocr.Core.Entities;
using Ocr.Core.Options;
using Ocr.Preprocess;
using Serilog;

public sealed class OcrEngineFactory : IOcrEngineFactory, IAsyncDisposable
{
    private readonly ILogger _logger;
    private readonly ILogger _baseLogger;
    private readonly IOptionsMonitor<OcrOptions> _options;
    private readonly FastPreprocessor _fastPreprocessor;
    private readonly EnhancedPreprocessor _enhancedPreprocessor;
    private readonly Lazy<TesseractOcrEngine> _fastEngine;
    private readonly Lazy<PpOcrOnnxEngine> _enhancedEngine;

    public OcrEngineFactory(
        ILogger logger,
        IOptionsMonitor<OcrOptions> options,
        FastPreprocessor fastPreprocessor,
        EnhancedPreprocessor enhancedPreprocessor)
    {
        _baseLogger = logger;
        _logger = logger.ForContext<OcrEngineFactory>();
        _options = options;
        _fastPreprocessor = fastPreprocessor;
        _enhancedPreprocessor = enhancedPreprocessor;
        _fastEngine = new Lazy<TesseractOcrEngine>(CreateFastEngine, LazyThreadSafetyMode.ExecutionAndPublication);
        _enhancedEngine = new Lazy<PpOcrOnnxEngine>(CreateEnhancedEngine, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public IOcrEngine GetEngine(OcrMode mode, DocumentType? documentType = null)
    {
        var effectiveMode = mode switch
        {
            OcrMode.Auto => documentType?.PreferredMode ?? _options.CurrentValue.DefaultMode,
            _ => mode
        };

        return effectiveMode switch
        {
            OcrMode.Enhanced => TryGetEnhancedEngine() ?? _fastEngine.Value,
            OcrMode.Fast => _fastEngine.Value,
            _ => _fastEngine.Value
        };
    }

    private TesseractOcrEngine CreateFastEngine()
    {
        var opts = _options.CurrentValue.Tesseract;
        return new TesseractOcrEngine(
            _baseLogger,
            _fastPreprocessor,
            opts.TessdataPath,
            opts.Languages,
            opts.Psm,
            opts.Oem,
            opts.Whitelist);
    }

    private PpOcrOnnxEngine CreateEnhancedEngine()
    {
        var opts = _options.CurrentValue.Onnx;
        var sessionOptions = new SessionOptions
        {
            IntraOpNumThreads = opts.ThreadCount
        };

        if (opts.UseGpu)
        {
            try
            {
#if WINDOWS
                if (string.Equals(opts.Provider, "DirectML", StringComparison.OrdinalIgnoreCase))
                {
                    sessionOptions.AppendExecutionProvider_DML();
                }
                else
#endif
                if (string.Equals(opts.Provider, "CUDA", StringComparison.OrdinalIgnoreCase))
                {
                    sessionOptions.AppendExecutionProvider_CUDA();
                }
            }
            catch
            {
                // Fallback to CPU if provider initialization fails.
            }
        }

        var detector = new InferenceSession(opts.DetModel, sessionOptions);
        var recognizer = new InferenceSession(opts.RecModel, sessionOptions);
        return new PpOcrOnnxEngine(
            _baseLogger,
            _enhancedPreprocessor,
            detector,
            recognizer);
    }

    private PpOcrOnnxEngine? TryGetEnhancedEngine()
    {
        try
        {
            return _enhancedEngine.Value;
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Falling back to FAST OCR because ENHANCED engine could not be initialized");
            return null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_enhancedEngine.IsValueCreated)
        {
            await _enhancedEngine.Value.DisposeAsync();
        }

        if (_fastEngine.IsValueCreated && _fastEngine.Value is IAsyncDisposable asyncDisposable)
        {
            await asyncDisposable.DisposeAsync();
        }
        else if (_fastEngine.IsValueCreated && _fastEngine.Value is IDisposable disposable)
        {
            disposable.Dispose();
        }
    }
}
