namespace Ocr.Api.Controllers;

using Microsoft.AspNetCore.Mvc;

[Route("test")]
public sealed class TestController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }
}
