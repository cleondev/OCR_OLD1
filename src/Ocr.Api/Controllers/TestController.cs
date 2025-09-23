namespace Ocr.Api.Controllers;

using System.Net.Mime;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("test")]
public sealed class TestController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public TestController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpGet]
    public IActionResult Index()
    {
        var file = _environment.WebRootFileProvider.GetFileInfo("test/index.html");
        if (!file.Exists)
        {
            return Problem("Test view not found", statusCode: StatusCodes.Status500InternalServerError);
        }

        return File(file.CreateReadStream(), MediaTypeNames.Text.Html);
    }
}
