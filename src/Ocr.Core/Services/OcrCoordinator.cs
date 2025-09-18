namespace Ocr.Core.Services;

using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Ocr.Core.Abstractions;
using Ocr.Core.Entities;
using Ocr.Core.Models;

public sealed class OcrCoordinator
{
    private readonly ILogger<OcrCoordinator> _logger;
    private readonly IOcrEngineFactory _engineFactory;
    private readonly ITemplateExtractor _extractor;
    private readonly ISamplerProvider _samplerProvider;
    private readonly Func<string, Task<DocumentType?>> _documentTypeResolver;

    public OcrCoordinator(
        ILogger<OcrCoordinator> logger,
        IOcrEngineFactory engineFactory,
        ITemplateExtractor extractor,
        ISamplerProvider samplerProvider,
        Func<string, Task<DocumentType?>> documentTypeResolver)
    {
        _logger = logger;
        _engineFactory = engineFactory;
        _extractor = extractor;
        _samplerProvider = samplerProvider;
        _documentTypeResolver = documentTypeResolver;
    }

    public async Task<OcrResult> ProcessAsync(OcrRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting OCR for {File} in mode {Mode}", request.FileName, request.Mode);

        DocumentType? docType = null;
        if (!string.IsNullOrWhiteSpace(request.DocumentTypeCode))
        {
            docType = await _documentTypeResolver(request.DocumentTypeCode!);
        }

        var engine = _engineFactory.GetEngine(request.Mode, docType);
        _logger.LogInformation("Using engine {Engine}", engine.Name);

        await using var imageCopy = new MemoryStream();
        await request.Content.CopyToAsync(imageCopy, cancellationToken);
        imageCopy.Position = 0;

        var text = await engine.RecognizeTextAsync(imageCopy, cancellationToken);

        var template = docType?.Templates.FirstOrDefault(t => t.IsActive);
        var fields = template is not null
            ? await _extractor.ExtractAsync(text, template, cancellationToken)
            : new Dictionary<string, string>();

        var filtered = _samplerProvider.ApplySampler(fields, request.SamplerCode);

        _logger.LogInformation("OCR finished for {File}", request.FileName);

        return new OcrResult(
            docType?.Code ?? "UNKNOWN",
            engine.Name,
            text,
            filtered,
            docType?.OcrConfigJson is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(docType.OcrConfigJson),
            template);
    }
}
