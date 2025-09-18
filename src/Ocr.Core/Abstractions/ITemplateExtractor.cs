namespace Ocr.Core.Abstractions;

using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Ocr.Core.Entities;

public interface ITemplateExtractor
{
    Task<IReadOnlyDictionary<string, string>> ExtractAsync(string text, Template template, CancellationToken cancellationToken = default);
}
