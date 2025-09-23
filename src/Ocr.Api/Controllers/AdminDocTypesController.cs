namespace Ocr.Api.Controllers;

using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Ocr.Storage;

[ApiController]
[Route("api/admin/doc-types")]
public sealed class AdminDocTypesController : ControllerBase
{
    private readonly DocumentTypeRepository _repository;

    public AdminDocTypesController(DocumentTypeRepository repository)
    {
        _repository = repository;
    }

    [HttpGet]
    public async Task<IActionResult> GetAsync(CancellationToken cancellationToken)
    {
        var docTypes = await _repository.ListAsync(cancellationToken);
        var payload = docTypes.Select(dt => new
        {
            dt.Id,
            dt.Code,
            dt.Name,
            PreferredMode = dt.PreferredMode.ToString(),
            Templates = dt.Templates.Select(t => new { t.Id, t.Version, t.IsActive })
        });

        return Ok(payload);
    }
}
