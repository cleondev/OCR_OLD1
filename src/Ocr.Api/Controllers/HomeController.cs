namespace Ocr.Api.Controllers;

using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("")]
public sealed class HomeController : ControllerBase
{
    [HttpGet]
    public IActionResult Index() => Redirect("/test");
}
