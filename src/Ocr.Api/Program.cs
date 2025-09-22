using System.Linq;
using System.IO;
using System.Net.Mime;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Ocr.Core;
using Ocr.Core.Abstractions;
using Ocr.Core.Models;
using Ocr.Core.Options;
using Ocr.Core.Services;
using Ocr.Engines;
using Ocr.Extractor;
using Ocr.Preprocess;
using Ocr.Storage;
using Ocr.Workers;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog(Log.Logger, dispose: true);

builder.Services.AddSingleton<ILogger>(Log.Logger);

builder.Services.AddOptions();
builder.Services.Configure<OcrOptions>(builder.Configuration.GetSection("Ocr"));

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<DocumentTypeRepository>();

builder.Services.AddSingleton<FastPreprocessor>();
builder.Services.AddSingleton<EnhancedPreprocessor>();

builder.Services.AddSingleton<RegexTemplateExtractor>();
builder.Services.AddSingleton<SamplerProvider>(sp =>
{
    var provider = new SamplerProvider(sp.GetRequiredService<ILogger>());
    var env = sp.GetRequiredService<IHostEnvironment>();
    var path = Path.Combine(env.ContentRootPath, "templates", "samplers.json");
    if (File.Exists(path))
    {
        provider.LoadFromJson(File.ReadAllText(path));
    }
    return provider;
});

builder.Services.AddSingleton<ITemplateExtractor>(sp => sp.GetRequiredService<RegexTemplateExtractor>());
builder.Services.AddSingleton<ISamplerProvider>(sp => sp.GetRequiredService<SamplerProvider>());

builder.Services.AddSingleton<IOcrEngineFactory, Ocr.Engines.OcrEngineFactory>();

builder.Services.AddScoped<OcrCoordinator>(sp =>
{
    var repository = sp.GetRequiredService<DocumentTypeRepository>();
    return new OcrCoordinator(
        sp.GetRequiredService<ILogger>(),
        sp.GetRequiredService<IOcrEngineFactory>(),
        sp.GetRequiredService<ITemplateExtractor>(),
        sp.GetRequiredService<ISamplerProvider>(),
        code => repository.FindByCodeAsync(code));
});

builder.Services.AddHostedService<EngineWarmupWorker>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "OCR Suite API",
        Version = "v1"
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.UseStaticFiles();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await SeedData.EnsureSeedDataAsync(dbContext);
}

app.MapGet("/", () => Results.Redirect("/test"));

app.MapGet("/api/admin/doc-types", async (DocumentTypeRepository repository, CancellationToken cancellationToken) =>
{
    var docTypes = await repository.ListAsync(cancellationToken);
    return Results.Ok(docTypes.Select(dt => new
    {
        dt.Id,
        dt.Code,
        dt.Name,
        PreferredMode = dt.PreferredMode.ToString(),
        Templates = dt.Templates.Select(t => new { t.Id, t.Version, t.IsActive })
    }));
});

app.MapPost("/api/ocr", async Task<Results<Ok<OcrResult>, BadRequest<string>>> (
    HttpRequest request,
    OcrCoordinator coordinator,
    CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
    {
        return TypedResults.BadRequest("Invalid form data");
    }

    var form = await request.ReadFormAsync(cancellationToken);
    var file = form.Files.GetFile("file");
    if (file is null)
    {
        return TypedResults.BadRequest("Missing file");
    }

    var mode = ParseMode(form["mode"].FirstOrDefault());
    var docTypeCode = form["docType"].FirstOrDefault();
    var sampler = form["sampler"].FirstOrDefault();

    await using var stream = file.OpenReadStream();
    var result = await coordinator.ProcessAsync(new OcrRequest(stream, file.FileName, docTypeCode, mode, sampler), cancellationToken);
    return TypedResults.Ok(result);
});

app.MapGet("/test", (IWebHostEnvironment env) =>
{
    var file = env.WebRootFileProvider.GetFileInfo("test/index.html");
    if (!file.Exists)
    {
        return Results.Problem("Test view not found", statusCode: StatusCodes.Status500InternalServerError);
    }

    return Results.Stream(file.CreateReadStream, MediaTypeNames.Text.Html);
});

app.Run();

static OcrMode ParseMode(string? raw)
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
