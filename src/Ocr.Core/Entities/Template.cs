namespace Ocr.Core.Entities;

using System;

public class Template
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string Version { get; set; } = "v1";
    public string AnchorsJson { get; set; } = "{}";
    public string FieldsJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public DocumentType? DocumentType { get; set; }
}
