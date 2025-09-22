namespace Ocr.Extractor;

using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using Ocr.Core.Abstractions;
using Serilog;
using ILogger = Serilog.ILogger;

public sealed class SamplerProvider : ISamplerProvider
{
    private readonly ILogger _logger;
    private readonly IDictionary<string, string[]> _samplers;

    public SamplerProvider(ILogger logger)
    {
        _logger = logger.ForContext<SamplerProvider>();
        _samplers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyDictionary<string, string> ApplySampler(IReadOnlyDictionary<string, string> fields, string? samplerCode)
    {
        if (string.IsNullOrWhiteSpace(samplerCode))
        {
            return fields;
        }

        if (!_samplers.TryGetValue(samplerCode, out var fieldList))
        {
            _logger.Warning("Sampler {Sampler} not found; returning all fields", samplerCode);
            return fields;
        }

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in fieldList)
        {
            if (fields.TryGetValue(field, out var value))
            {
                result[field] = value;
            }
        }

        return result;
    }

    public void LoadFromJson(string json)
    {
        try
        {
            var node = JsonNode.Parse(json) as JsonObject;
            if (node is null)
            {
                return;
            }

            foreach (var (code, value) in node)
            {
                if (value is JsonArray arr)
                {
                    _samplers[code] = arr.Select(item => item?.GetValue<string>() ?? string.Empty)
                        .Where(x => !string.IsNullOrWhiteSpace(x))
                        .ToArray();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to load samplers from JSON");
        }
    }
}
