namespace Ocr.Core.Abstractions;

using System.Collections.Generic;

public interface ISamplerProvider
{
    IReadOnlyDictionary<string, string> ApplySampler(IReadOnlyDictionary<string, string> fields, string? samplerCode);
}
