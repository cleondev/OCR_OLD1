namespace Ocr.Core.Options;

using Ocr.Core;

public sealed class OcrOptions
{
    public OcrMode DefaultMode { get; set; } = OcrMode.Auto;
    public TesseractOptions Tesseract { get; set; } = new();
    public OnnxOptions Onnx { get; set; } = new();
}

public sealed class TesseractOptions
{
    public string TessdataPath { get; set; } = "models/tessdata";
    public string Languages { get; set; } = "vie+eng";
    public int Psm { get; set; } = 6;
    public int Oem { get; set; } = 1;
    public string? Whitelist { get; set; }
}

public sealed class OnnxOptions
{
    public string DetModel { get; set; } = "models/onnx/ppocrv3_det.onnx";
    public string RecModel { get; set; } = "models/onnx/ppocrv3_rec.onnx";
    public string Provider { get; set; } = "CPU";
    public bool UseGpu { get; set; }
    public int ThreadCount { get; set; } = 4;
}
