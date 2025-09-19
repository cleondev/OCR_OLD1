namespace Ocr.Core.Abstractions;

using System.IO;
using System.Threading;
using System.Threading.Tasks;

public interface IImagePreprocessor
{
    Task<Stream> PreprocessAsync(Stream input, CancellationToken cancellationToken = default);
}
