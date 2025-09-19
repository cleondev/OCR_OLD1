namespace Ocr.Engines;

using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Ocr.Core.Abstractions;
using Ocr.Core.Models;
using Ocr.Preprocess;
using Tesseract;

public sealed class TesseractOcrEngine : IOcrEngine
{
    private readonly ILogger<TesseractOcrEngine> _logger;
    private readonly FastPreprocessor _preprocessor;
    private readonly string _tessDataPath;
    private readonly string _languages;
    private readonly int _psm;
    private readonly int _oem;
    private readonly string? _whitelist;

    public TesseractOcrEngine(
        ILogger<TesseractOcrEngine> logger,
        FastPreprocessor preprocessor,
        string tessDataPath,
        string languages,
        int psm,
        int oem,
        string? whitelist)
    {
        _logger = logger;
        _preprocessor = preprocessor;
        _tessDataPath = tessDataPath;
        _languages = languages;
        _psm = psm;
        _oem = oem;
        _whitelist = whitelist;
    }

    public string Name => "FAST/TESSERACT";

    public async Task<string> RecognizeTextAsync(Stream imageStream, CancellationToken cancellationToken = default)
    {
        await using var processed = await _preprocessor.PreprocessAsync(imageStream, cancellationToken);
        processed.Position = 0;

        try
        {
            using var engine = new TesseractEngine(_tessDataPath, _languages, (EngineMode)_oem);
            if (!string.IsNullOrEmpty(_whitelist))
            {
                engine.SetVariable("tessedit_char_whitelist", _whitelist);
            }

            using var pix = Pix.LoadFromMemory(processed.ToArray());
            using var page = engine.Process(pix, (PageSegMode)_psm);
            return page.GetText();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Tesseract OCR failed; returning fallback text");
            processed.Position = 0;
            using var reader = new StreamReader(processed, leaveOpen: true);
            var fallback = await reader.ReadToEndAsync(cancellationToken);
            return $"[TESSERACT_ERROR]{fallback}";
        }
    }
}
