namespace Ocr.Core.Abstractions;

using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Ocr.Core.Models;

public interface IOcrEngine
{
    string Name { get; }
    Task<string> RecognizeTextAsync(Stream imageStream, CancellationToken cancellationToken = default);
}
