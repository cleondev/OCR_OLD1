namespace Ocr.Classifier;

using System.IO;
using System.Linq;
using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.Extensions.Logging;

public sealed class TextClassifier
{
    private readonly ILogger<TextClassifier> _logger;
    private readonly object _syncRoot = new();
    private ITransformer? _model;
    private PredictionEngine<TextSample, TextPrediction>? _predictionEngine;

    public TextClassifier(ILogger<TextClassifier> logger)
    {
        _logger = logger;
    }

    public void LoadModel(string modelPath)
    {
        if (!File.Exists(modelPath))
        {
            _logger.LogWarning("Classifier model {Path} not found", modelPath);
            return;
        }

        lock (_syncRoot)
        {
            var mlContext = new MLContext();
            using var stream = File.OpenRead(modelPath);
            _model = mlContext.Model.Load(stream, out _);
            _predictionEngine = mlContext.Model.CreatePredictionEngine<TextSample, TextPrediction>(_model);
        }
    }

    public string? Predict(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        lock (_syncRoot)
        {
            if (_predictionEngine is null)
            {
                return null;
            }

            var prediction = _predictionEngine.Predict(new TextSample { Text = text });
            if (prediction.Score is null || prediction.Score.Length == 0)
            {
                return null;
            }

            var maxIndex = 0;
            for (var i = 1; i < prediction.Score.Length; i++)
            {
                if (prediction.Score[i] > prediction.Score[maxIndex])
                {
                    maxIndex = i;
                }
            }

            if (_predictionEngine.OutputSchema.GetColumnOrNull("PredictedLabel")?.Column.GetAnnotationValue<VBuffer<ReadOnlyMemory<char>>>(AnnotationUtils.Kinds.SlotNames) is { } slotNames)
            {
                var names = slotNames.DenseValues().Select(memory => memory.ToString()).ToArray();
                if (maxIndex < names.Length)
                {
                    return names[maxIndex];
                }
            }

            return null;
        }
    }

    private sealed class TextSample
    {
        [LoadColumn(0)]
        public string Text { get; set; } = string.Empty;
    }

    private sealed class TextPrediction
    {
        [ColumnName("PredictedLabel")] public string PredictedLabel { get; set; } = string.Empty;
        public float[]? Score { get; set; }
    }
}
