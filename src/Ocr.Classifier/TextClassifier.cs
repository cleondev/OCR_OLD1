namespace Ocr.Classifier;

using System.IO;
using System.Linq;
using Microsoft.ML;
using Microsoft.ML.Data;
using Serilog;

public sealed class TextClassifier
{
    private readonly ILogger _logger;
    private readonly object _syncRoot = new();
    private ITransformer? _model;
    private PredictionEngine<TextSample, TextPrediction>? _predictionEngine;

    public TextClassifier(ILogger logger)
    {
        _logger = logger.ForContext<TextClassifier>();
    }

    public void LoadModel(string modelPath)
    {
        if (!File.Exists(modelPath))
        {
            _logger.Warning("Classifier model {Path} not found", modelPath);
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

            if (!string.IsNullOrWhiteSpace(prediction.PredictedLabel))
            {
                return prediction.PredictedLabel;
            }

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

            if (_predictionEngine.OutputSchema.TryGetColumnIndex(nameof(TextPrediction.Score), out var scoreColumnIndex))
            {
                var scoreColumn = _predictionEngine.OutputSchema[scoreColumnIndex];
                if (scoreColumn.HasSlotNames())
                {
                    VBuffer<ReadOnlyMemory<char>> slotNames = default;
                    scoreColumn.GetSlotNames(ref slotNames);
                    var names = slotNames.DenseValues().Select(memory => memory.ToString()).ToArray();
                    if (maxIndex < names.Length)
                    {
                        return names[maxIndex];
                    }
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
