namespace Ocr.Preprocess;

using System.IO;
using System.Threading;
using System.Threading.Tasks;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Advanced;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using Ocr.Core.Abstractions;

public sealed class EnhancedPreprocessor : IImagePreprocessor
{
    public async Task<Stream> PreprocessAsync(Stream input, CancellationToken cancellationToken = default)
    {
        input.Position = 0;
        using var image = await Image.LoadAsync<Rgba32>(input, cancellationToken);
        image.Mutate(ctx =>
        {
            ctx.AutoOrient();
            ctx.Contrast(1.2f);
            ctx.Saturation(1.05f);
            ctx.GaussianSharpen();
        });

        var luminance = image.CloneAs<L8>();
        luminance.Mutate(ctx => ctx.BinaryThreshold(0.5f));

        var ms = new MemoryStream();
        await luminance.SaveAsPngAsync(ms, cancellationToken);
        ms.Position = 0;
        return ms;
    }
}
