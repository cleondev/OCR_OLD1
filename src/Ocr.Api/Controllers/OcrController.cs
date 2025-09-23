namespace Ocr.Api.Controllers;

using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Ocr.Core;
using Ocr.Core.Models;
using Ocr.Core.Services;

[ApiController]
[Route("api/ocr")]
public sealed class OcrController : ControllerBase
{
    private readonly OcrCoordinator _coordinator;

    public OcrController(OcrCoordinator coordinator)
    {
        _coordinator = coordinator;
    }

    [HttpPost]
    public async Task<ActionResult<OcrResult>> ProcessAsync()
    {
        if (!Request.HasFormContentType)
        {
            return BadRequest("Invalid form data");
        }

        var form = await Request.ReadFormAsync(HttpContext.RequestAborted);
        var file = form.Files.GetFile("file");
        if (file is null)
        {
            return BadRequest("Missing file");
        }

        var mode = ParseMode(form["mode"].FirstOrDefault());
        var docTypeCode = form["docType"].FirstOrDefault();
        var sampler = form["sampler"].FirstOrDefault();

        await using var stream = file.OpenReadStream();
        var result = await _coordinator.ProcessAsync(
            new OcrRequest(stream, file.FileName, docTypeCode, mode, sampler),
            HttpContext.RequestAborted);

        return Ok(result);
    }

    private static OcrMode ParseMode(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return OcrMode.Auto;
        }

        return raw.ToUpperInvariant() switch
        {
            "FAST" => OcrMode.Fast,
            "ENHANCED" => OcrMode.Enhanced,
            _ => OcrMode.Auto
        };
    }
}
