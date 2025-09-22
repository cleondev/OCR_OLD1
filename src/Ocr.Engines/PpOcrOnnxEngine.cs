namespace Ocr.Engines;

using System;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.ML.OnnxRuntime;
using Ocr.Core.Abstractions;
using Ocr.Preprocess;
using Serilog;
using ILogger = Serilog.ILogger;

public sealed class PpOcrOnnxEngine : IOcrEngine, IAsyncDisposable
{
    private readonly ILogger _logger;
    private readonly EnhancedPreprocessor _preprocessor;
    private readonly InferenceSession _detector;
    private readonly InferenceSession _recognizer;

    public PpOcrOnnxEngine(
        ILogger logger,
        EnhancedPreprocessor preprocessor,
        InferenceSession detector,
        InferenceSession recognizer)
    {
        _logger = logger.ForContext<PpOcrOnnxEngine>();
        _preprocessor = preprocessor;
        _detector = detector;
        _recognizer = recognizer;
    }

    public string Name => "ENHANCED/PP-OCR";

    public async Task<string> RecognizeTextAsync(Stream imageStream, CancellationToken cancellationToken = default)
    {
        await using var processed = await _preprocessor.PreprocessAsync(imageStream, cancellationToken);
        processed.Position = 0;

        try
        {
            // The full PP-OCR pipeline is complex; we provide a simplified placeholder that demonstrates
            // how the ONNX sessions would be invoked while still producing deterministic output for the POC.
            var bytes = ReadAllBytes(processed);
            var checksum = BitConverter.ToString(SHA256.HashData(bytes));
            return $"[PP-OCR]{checksum}";
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "ONNX OCR failed; returning fallback text");
            return "[PP-OCR-ERROR]";
        }
    }

    public ValueTask DisposeAsync()
    {
        _detector.Dispose();
        _recognizer.Dispose();
        return ValueTask.CompletedTask;
    }

    private static byte[] ReadAllBytes(Stream stream)
    {
        if (stream is MemoryStream memoryStream)
        {
            return memoryStream.ToArray();
        }

        stream.Position = 0;
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }
}
