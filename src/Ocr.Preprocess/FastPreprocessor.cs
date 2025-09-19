namespace Ocr.Preprocess;

using System.IO;
using System.Threading;
using System.Threading.Tasks;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using Ocr.Core.Abstractions;

public sealed class FastPreprocessor : IImagePreprocessor
{
    public async Task<Stream> PreprocessAsync(Stream input, CancellationToken cancellationToken = default)
    {
        input.Position = 0;
        using var image = await Image.LoadAsync(input, cancellationToken);
        image.Mutate(ctx =>
        {
            ctx.AutoOrient();
            ctx.Grayscale();
            ctx.Contrast(1.1f);
        });

        var ms = new MemoryStream();
        await image.SaveAsPngAsync(ms, cancellationToken);
        ms.Position = 0;
        return ms;
    }
}
