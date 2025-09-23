namespace Ocr.Api.Controllers;

using System.Net.Mime;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("admin")]
public sealed class AdminViewController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public AdminViewController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpGet]
    [HttpGet("{*path}")]
    public IActionResult Index()
    {
        var file = _environment.WebRootFileProvider.GetFileInfo("admin/index.html");
        if (!file.Exists)
        {
            return Problem("Admin view not found", statusCode: StatusCodes.Status500InternalServerError);
        }

        return File(file.CreateReadStream(), MediaTypeNames.Text.Html);
    }
}
