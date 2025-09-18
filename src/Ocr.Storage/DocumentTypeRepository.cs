namespace Ocr.Storage;

using System.Collections.Generic;
using System.Threading;
using Microsoft.EntityFrameworkCore;
using Ocr.Core.Entities;

public sealed class DocumentTypeRepository
{
    private readonly AppDbContext _dbContext;

    public DocumentTypeRepository(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<List<DocumentType>> ListAsync(CancellationToken cancellationToken = default)
        => _dbContext.DocumentTypes
            .Include(x => x.Templates)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

    public Task<DocumentType?> FindByCodeAsync(string code, CancellationToken cancellationToken = default)
        => _dbContext.DocumentTypes
            .Include(x => x.Templates)
            .FirstOrDefaultAsync(x => x.Code == code, cancellationToken);
}
