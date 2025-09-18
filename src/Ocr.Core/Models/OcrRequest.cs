namespace Ocr.Core.Models;

using System.IO;
using Ocr.Core;

public sealed record OcrRequest(
    Stream Content,
    string FileName,
    string? DocumentTypeCode,
    OcrMode Mode,
    string? SamplerCode);
