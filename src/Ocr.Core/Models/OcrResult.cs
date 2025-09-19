namespace Ocr.Core.Models;

using System.Collections.Generic;
using System.Text.Json.Nodes;
public sealed record OcrResult(
    string DocumentTypeCode,
    string Mode,
    string FullText,
    IReadOnlyDictionary<string, string> Fields,
    JsonObject? Metadata,
    TemplateInfo? Template);

public sealed record TemplateInfo(
    int Id,
    string Version,
    string? AnchorsJson,
    string? FieldsJson);
