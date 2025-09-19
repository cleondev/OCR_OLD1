namespace Ocr.Storage;

using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Ocr.Core;
using Ocr.Core.Entities;

public static class SeedData
{
    public static async Task EnsureSeedDataAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
    {
        await dbContext.Database.EnsureCreatedAsync(cancellationToken);

        if (await dbContext.DocumentTypes.AnyAsync(cancellationToken))
        {
            return;
        }

        var docType = new DocumentType
        {
            Code = "CCCD_FULL",
            Name = "Căn Cước Công Dân (Full)",
            PreferredMode = OcrMode.Fast,
            SchemaJson = "{\"fields\":[\"id\",\"name\",\"dob\"]}",
            OcrConfigJson = "{\"psm\":6}",
            Templates =
            {
                new Template
                {
                    Version = "v1",
                    AnchorsJson = "{}",
                    FieldsJson = "{\"id\":{\"regex\":\"[0-9]{12}\"}}"
                }
            }
        };

        await dbContext.DocumentTypes.AddAsync(docType, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
