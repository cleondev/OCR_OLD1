namespace Ocr.Core.Entities;

using System;
using System.Collections.Generic;
using Ocr.Core;

public class DocumentType
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? SchemaJson { get; set; }
    public string? OcrConfigJson { get; set; }
    public OcrMode PreferredMode { get; set; } = OcrMode.Auto;
    public string? ModelPath { get; set; }
    public string? OnnxConfigJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Template> Templates { get; set; } = new List<Template>();
    public ICollection<DocumentSample> Samples { get; set; } = new List<DocumentSample>();
}
