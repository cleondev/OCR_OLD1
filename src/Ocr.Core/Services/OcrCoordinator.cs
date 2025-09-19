namespace Ocr.Core.Services;

using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
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
    private readonly Func<string, CancellationToken, Task<DocumentType?>> _documentTypeResolver;

    public OcrCoordinator(
        ILogger<OcrCoordinator> logger,
        IOcrEngineFactory engineFactory,
        ITemplateExtractor extractor,
        ISamplerProvider samplerProvider,
        Func<string, CancellationToken, Task<DocumentType?>> documentTypeResolver)
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
            docType = await _documentTypeResolver(request.DocumentTypeCode!, cancellationToken);
            if (docType is null)
            {
                _logger.LogWarning("Document type {DocType} not found; defaulting to AUTO mode", request.DocumentTypeCode);
            }
        }

        var engine = _engineFactory.GetEngine(request.Mode, docType);
        _logger.LogInformation("Using engine {Engine}", engine.Name);

        await using var imageCopy = new MemoryStream();
        if (request.Content.CanSeek)
        {
            request.Content.Position = 0;
        }

        await request.Content.CopyToAsync(imageCopy, cancellationToken);
        imageCopy.Position = 0;

        var text = await engine.RecognizeTextAsync(imageCopy, cancellationToken);

        var template = docType?.Templates.FirstOrDefault(t => t.IsActive);
        var fields = template is not null
            ? await _extractor.ExtractAsync(text, template, cancellationToken)
            : new Dictionary<string, string>();

        var sampled = _samplerProvider.ApplySampler(fields, request.SamplerCode);
        var filtered = sampled is Dictionary<string, string> dictionary
            ? new Dictionary<string, string>(dictionary, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(sampled, StringComparer.OrdinalIgnoreCase);

        _logger.LogInformation("OCR finished for {File}", request.FileName);

        JsonObject? metadata = null;
        if (!string.IsNullOrWhiteSpace(docType?.OcrConfigJson))
        {
            try
            {
                metadata = JsonNode.Parse(docType.OcrConfigJson!) as JsonObject;
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to deserialize OCR metadata for {DocType}", docType?.Code);
            }
        }

        var templateInfo = template is null
            ? null
            : new TemplateInfo(template.Id, template.Version, template.AnchorsJson, template.FieldsJson);

        return new OcrResult(
            docType?.Code ?? "UNKNOWN",
            engine.Name,
            text,
            filtered,
            metadata,
            templateInfo);
    }
}
