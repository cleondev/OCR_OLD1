namespace Ocr.Core.Entities;

using System;

public class DocumentSample
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? FullText { get; set; }
    public string? FieldsJson { get; set; }
    public bool IsLabeled { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public DocumentType? DocumentType { get; set; }
}
