using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Ocr.Api.Mock;
using Ocr.Core.Abstractions;
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

builder.Services.AddSingleton<Serilog.ILogger>(Log.Logger);

builder.Services.AddOptions();
builder.Services.Configure<OcrOptions>(builder.Configuration.GetSection("Ocr"));

builder.Services.AddControllers();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<DocumentTypeRepository>();

builder.Services.AddSingleton<AdminMockStore>();

builder.Services.AddSingleton<FastPreprocessor>();
builder.Services.AddSingleton<EnhancedPreprocessor>();

builder.Services.AddSingleton<RegexTemplateExtractor>();
builder.Services.AddSingleton<SamplerProvider>(sp =>
{
    var provider = new SamplerProvider(sp.GetRequiredService<Serilog.ILogger>());
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
        sp.GetRequiredService<Serilog.ILogger>(),
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

app.UseRouting();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await SeedData.EnsureSeedDataAsync(dbContext);
}

app.MapControllers();

app.Run();
