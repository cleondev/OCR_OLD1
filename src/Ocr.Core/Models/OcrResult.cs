namespace Ocr.Core.Models;

using System.Collections.Generic;
using Ocr.Core.Entities;

public sealed record OcrResult(
    string DocumentTypeCode,
    string Mode,
    string FullText,
    IReadOnlyDictionary<string, string> Fields,
    IReadOnlyDictionary<string, string>? Metadata,
    Template? TemplateUsed);
