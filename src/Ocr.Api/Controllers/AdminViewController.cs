namespace Ocr.Api.Controllers;

using Microsoft.AspNetCore.Mvc;

[Route("admin")]
public sealed class AdminViewController : Controller
{
    [HttpGet]
    [HttpGet("{*path}")]
    public IActionResult Index()
    {
        return View();
    }
}
