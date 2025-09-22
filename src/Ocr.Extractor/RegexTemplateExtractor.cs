namespace Ocr.Extractor;

using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Serilog;
using Ocr.Core.Abstractions;
using Ocr.Core.Entities;

public sealed class RegexTemplateExtractor : ITemplateExtractor
{
    private readonly ILogger _logger;

    public RegexTemplateExtractor(ILogger logger)
    {
        _logger = logger.ForContext<RegexTemplateExtractor>();
    }

    public Task<IReadOnlyDictionary<string, string>> ExtractAsync(string text, Template template, CancellationToken cancellationToken = default)
    {
        var results = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(template.FieldsJson))
        {
            return Task.FromResult<IReadOnlyDictionary<string, string>>(results);
        }

        try
        {
            var json = JsonNode.Parse(template.FieldsJson) as JsonObject;
            if (json is null)
            {
                return Task.FromResult<IReadOnlyDictionary<string, string>>(results);
            }

            foreach (var (field, definition) in json)
            {
                if (definition is not JsonObject fieldObj)
                {
                    continue;
                }

                var regexPattern = fieldObj["regex"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(regexPattern))
                {
                    continue;
                }

                var match = Regex.Match(text, regexPattern, RegexOptions.Multiline);
                if (match.Success)
                {
                    results[field] = match.Groups.Count > 1 ? match.Groups[1].Value : match.Value;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to parse template fields for template {TemplateId}", template.Id);
        }

        return Task.FromResult<IReadOnlyDictionary<string, string>>(results);
    }
}
