namespace Ocr.Api.Mock;

using System;
using System.Collections.Generic;
using System.Linq;
using Ocr.Core;

public sealed class AdminMockStore
{
    private readonly List<MockDocumentType> _docTypes = new();
    private int _nextDocTypeId = 1;
    private int _nextSampleId = 1;
    private int _nextTemplateId = 1;
    private int _nextSamplerId = 1;
    private int _nextTrainingJobId = 1;

    public AdminMockStore()
    {
        Seed();
    }

    public IReadOnlyList<MockDocumentType> GetDocTypes() => _docTypes;

    public MockDocumentType? FindDocType(int id) => _docTypes.FirstOrDefault(dt => dt.Id == id);

    public MockSample? FindSample(int id) => _docTypes.SelectMany(dt => dt.Samples).FirstOrDefault(s => s.Id == id);

    public MockTemplate? FindTemplate(int id) => _docTypes.SelectMany(dt => dt.Templates).FirstOrDefault(t => t.Id == id);

    public MockSampler? FindSampler(int id) => _docTypes.SelectMany(dt => dt.Samplers).FirstOrDefault(s => s.Id == id);

    public MockTrainingJob? FindTrainingJob(int id) => _docTypes.SelectMany(dt => dt.TrainingJobs).FirstOrDefault(t => t.Id == id);

    public MockDocumentType CreateDocType(DocTypeUpsertRequest request)
    {
        var docType = new MockDocumentType
        {
            Id = _nextDocTypeId++,
            Code = request.Code.Trim(),
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            PreferredMode = ParseMode(request.PreferredMode),
            SchemaJson = request.SchemaJson?.Trim(),
            OcrConfigJson = request.OcrConfigJson?.Trim(),
            OnnxConfigJson = request.OnnxConfigJson?.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _docTypes.Add(docType);
        return docType;
    }

    public MockDocumentType UpdateDocType(int id, DocTypeUpsertRequest request)
    {
        var docType = FindDocType(id) ?? throw new InvalidOperationException("Document type not found");

        docType.Name = request.Name.Trim();
        docType.Description = request.Description?.Trim();
        docType.PreferredMode = ParseMode(request.PreferredMode);
        docType.SchemaJson = NormalizeOrNull(request.SchemaJson);
        docType.OcrConfigJson = NormalizeOrNull(request.OcrConfigJson);
        docType.OnnxConfigJson = NormalizeOrNull(request.OnnxConfigJson);
        docType.UpdatedAt = DateTimeOffset.UtcNow;
        return docType;
    }

    public MockTemplate CreateTemplate(int docTypeId, TemplateUpsertRequest request)
    {
        var docType = FindDocType(docTypeId) ?? throw new InvalidOperationException("Document type not found");
        var template = new MockTemplate
        {
            Id = _nextTemplateId++,
            DocumentTypeId = docTypeId,
            Version = string.IsNullOrWhiteSpace(request.Version) ? $"v{docType.Templates.Count + 1}" : request.Version.Trim(),
            Description = request.Description?.Trim(),
            AnchorsJson = string.IsNullOrWhiteSpace(request.AnchorsJson) ? "{}" : request.AnchorsJson,
            FieldsJson = string.IsNullOrWhiteSpace(request.FieldsJson) ? "{}" : request.FieldsJson,
            IsActive = request.IsActive,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        if (template.IsActive)
        {
            foreach (var tpl in docType.Templates)
            {
                tpl.IsActive = false;
            }
        }

        docType.Templates.Add(template);
        docType.UpdatedAt = template.UpdatedAt;
        return template;
    }

    public MockTemplate UpdateTemplate(int templateId, TemplateUpsertRequest request)
    {
        var template = FindTemplate(templateId) ?? throw new InvalidOperationException("Template not found");
        var docType = FindDocType(template.DocumentTypeId) ?? throw new InvalidOperationException("Document type not found");

        template.Description = request.Description?.Trim();
        template.Version = string.IsNullOrWhiteSpace(request.Version) ? template.Version : request.Version.Trim();
        template.AnchorsJson = string.IsNullOrWhiteSpace(request.AnchorsJson) ? "{}" : request.AnchorsJson;
        template.FieldsJson = string.IsNullOrWhiteSpace(request.FieldsJson) ? "{}" : request.FieldsJson;
        template.IsActive = request.IsActive;
        template.UpdatedAt = DateTimeOffset.UtcNow;

        if (template.IsActive)
        {
            foreach (var tpl in docType.Templates)
            {
                if (tpl.Id != template.Id)
                {
                    tpl.IsActive = false;
                }
            }
        }

        docType.UpdatedAt = template.UpdatedAt;
        return template;
    }

    public TemplateTestResult TestTemplate(int docTypeId, int templateId, TemplateTestRequest request)
    {
        var docType = FindDocType(docTypeId) ?? throw new InvalidOperationException("Document type not found");
        var template = docType.Templates.FirstOrDefault(t => t.Id == templateId) ?? throw new InvalidOperationException("Template not found");
        var sample = docType.Samples.FirstOrDefault(s => s.Id == request.SampleId) ?? throw new InvalidOperationException("Sample not found");

        var detectedFields = sample.Fields.Count > 0 ? new Dictionary<string, string>(sample.Fields)
            : sample.SuggestedFields is not null ? new Dictionary<string, string>(sample.SuggestedFields)
            : new Dictionary<string, string>();

        var result = new TemplateTestResult
        {
            SampleId = sample.Id,
            SampleFileName = sample.FileName,
            Passed = detectedFields.Count > 0,
            Summary = detectedFields.Count > 0
                ? $"Khớp {detectedFields.Count} trường trên mẫu {sample.FileName}"
                : "Chưa bắt được trường nào, cần rà soát anchor/regex",
            Fields = detectedFields,
            TestedAt = DateTimeOffset.UtcNow
        };

        template.LastTest = result;
        template.UpdatedAt = result.TestedAt;
        docType.UpdatedAt = result.TestedAt;
        return result;
    }

    public MockSampler CreateSampler(int docTypeId, SamplerUpsertRequest request)
    {
        var docType = FindDocType(docTypeId) ?? throw new InvalidOperationException("Document type not found");
        var sampler = new MockSampler
        {
            Id = _nextSamplerId++,
            DocumentTypeId = docTypeId,
            Code = string.IsNullOrWhiteSpace(request.Code) ? $"SAMPLER_{_nextSamplerId}" : request.Code.Trim().ToUpperInvariant(),
            Name = string.IsNullOrWhiteSpace(request.Name) ? "Sampler mới" : request.Name.Trim(),
            Description = request.Description?.Trim(),
            Fields = request.Fields?.Where(f => !string.IsNullOrWhiteSpace(f)).Select(f => f.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>(),
            IsActive = request.IsActive,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        docType.Samplers.Add(sampler);
        docType.UpdatedAt = sampler.UpdatedAt;
        return sampler;
    }

    public MockSampler UpdateSampler(int samplerId, SamplerUpsertRequest request)
    {
        var sampler = FindSampler(samplerId) ?? throw new InvalidOperationException("Sampler not found");
        sampler.Name = string.IsNullOrWhiteSpace(request.Name) ? sampler.Name : request.Name.Trim();
        sampler.Description = request.Description?.Trim();
        sampler.Fields = request.Fields?.Where(f => !string.IsNullOrWhiteSpace(f)).Select(f => f.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? new List<string>();
        sampler.IsActive = request.IsActive;
        sampler.UpdatedAt = DateTimeOffset.UtcNow;

        var docType = FindDocType(sampler.DocumentTypeId);
        if (docType is not null)
        {
            docType.UpdatedAt = sampler.UpdatedAt;
        }

        return sampler;
    }

    public MockSample CreateSample(int docTypeId, SampleCreateRequest request)
    {
        var docType = FindDocType(docTypeId) ?? throw new InvalidOperationException("Document type not found");
        var sample = new MockSample
        {
            Id = _nextSampleId++,
            DocumentTypeId = docTypeId,
            FileName = string.IsNullOrWhiteSpace(request.FileName) ? $"sample_{_nextSampleId}.jpg" : request.FileName.Trim(),
            UploadedBy = string.IsNullOrWhiteSpace(request.UploadedBy) ? "admin" : request.UploadedBy.Trim(),
            UploadedAt = DateTimeOffset.UtcNow,
            PreviewUrl = SamplePreviewPlaceholders[_nextSampleId % SamplePreviewPlaceholders.Length],
            Status = "Uploaded",
            OcrPreview = "Giấy tờ chưa qua gán nhãn. Vui lòng mở màn hình labeling để hoàn tất.",
            SuggestedFields = new Dictionary<string, string>
            {
                ["id"] = "001099002233",
                ["name"] = "Nguyen Van Demo",
                ["dob"] = "12/03/1992"
            }
        };

        docType.Samples.Insert(0, sample);
        docType.UpdatedAt = sample.UploadedAt;
        return sample;
    }

    public MockSample UpdateSampleLabel(int sampleId, SampleLabelRequest request)
    {
        var sample = FindSample(sampleId) ?? throw new InvalidOperationException("Sample not found");
        sample.LabeledText = request.LabeledText?.Trim();
        sample.Fields = request.Fields ?? new Dictionary<string, string>();
        sample.Notes = request.Notes?.Trim();
        sample.IsLabeled = sample.Fields.Count > 0 || !string.IsNullOrWhiteSpace(sample.LabeledText);
        sample.Status = sample.IsLabeled ? "Labeled" : sample.Status;
        sample.UpdatedAt = DateTimeOffset.UtcNow;

        var docType = FindDocType(sample.DocumentTypeId);
        if (docType is not null)
        {
            docType.UpdatedAt = sample.UpdatedAt;
        }

        return sample;
    }

    public MockTrainingJob TriggerTraining(int docTypeId, TrainingRequest request)
    {
        var docType = FindDocType(docTypeId) ?? throw new InvalidOperationException("Document type not found");
        var job = new MockTrainingJob
        {
            Id = _nextTrainingJobId++,
            DocumentTypeId = docTypeId,
            Mode = string.IsNullOrWhiteSpace(request.Mode) ? "FAST" : request.Mode.Trim().ToUpperInvariant(),
            Status = "Completed",
            CreatedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow.AddMinutes(5),
            Summary = string.IsNullOrWhiteSpace(request.Notes)
                ? "Đã tối ưu whitelist & psm dựa trên 12 mẫu gán nhãn. CER giảm 4%."
                : request.Notes.Trim()
        };

        docType.TrainingJobs.Insert(0, job);
        docType.UpdatedAt = job.CompletedAt ?? job.CreatedAt;
        return job;
    }

    private static string? NormalizeOrNull(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static OcrMode ParseMode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return OcrMode.Auto;
        }

        return Enum.TryParse<OcrMode>(value, true, out var mode) ? mode : OcrMode.Auto;
    }

    private void Seed()
    {
        var cccdFull = new MockDocumentType
        {
            Id = _nextDocTypeId++,
            Code = "CCCD_FULL",
            Name = "Căn cước công dân (2 mặt)",
            Description = "Áp dụng cho bản scan hai mặt CCCD 2021.",
            PreferredMode = OcrMode.Fast,
            SchemaJson = "{\n  \"fields\": [\"id\", \"name\", \"dob\", \"address\"]\n}",
            OcrConfigJson = "{\n  \"psm\": 6,\n  \"dpi\": 300\n}",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-20),
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-2)
        };

        cccdFull.Templates.Add(new MockTemplate
        {
            Id = _nextTemplateId++,
            DocumentTypeId = cccdFull.Id,
            Version = "v1",
            Description = "Regex cơ bản cho số định danh và ngày sinh.",
            AnchorsJson = "{\n  \"header\": \"CAN CUOC CONG DAN\"\n}",
            FieldsJson = "{\n  \"id\": { \"regex\": \"[0-9]{12}\" },\n  \"dob\": { \"regex\": \"[0-9]{2}\\/[0-9]{2}\\/[0-9]{4}\" }\n}",
            IsActive = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-3)
        });

        cccdFull.Templates.Add(new MockTemplate
        {
            Id = _nextTemplateId++,
            DocumentTypeId = cccdFull.Id,
            Version = "v1.1",
            Description = "Bổ sung regex địa chỉ.",
            AnchorsJson = "{\n  \"header\": \"CONG HOA XA HOI\"\n}",
            FieldsJson = "{\n  \"address\": { \"regex\": \"([A-Z\\s]+),\\s*(TP|Tinh)\" }\n}",
            IsActive = false,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-6)
        });

        cccdFull.Samplers.Add(new MockSampler
        {
            Id = _nextSamplerId++,
            DocumentTypeId = cccdFull.Id,
            Code = "CCCD_FULL",
            Name = "Bộ đầy đủ",
            Description = "Bao gồm tất cả trường bắt buộc cho tích hợp core banking.",
            Fields = new List<string> { "id", "name", "dob", "address" },
            IsActive = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-10)
        });

        cccdFull.Samplers.Add(new MockSampler
        {
            Id = _nextSamplerId++,
            DocumentTypeId = cccdFull.Id,
            Code = "CCCD_MINI",
            Name = "Bộ rút gọn",
            Description = "Chỉ lấy số định danh và họ tên.",
            Fields = new List<string> { "id", "name" },
            IsActive = false,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-8)
        });

        var sample1 = new MockSample
        {
            Id = _nextSampleId++,
            DocumentTypeId = cccdFull.Id,
            FileName = "cccd_front_demo.jpg",
            UploadedBy = "thu.tran",
            UploadedAt = DateTimeOffset.UtcNow.AddDays(-7),
            PreviewUrl = SamplePreviewPlaceholders[1],
            Status = "Labeled",
            OcrPreview = "CAN CUOC CONG DAN\nSO: 001099002233\nHo ten: NGUYEN VAN DEMO\nNgay sinh: 12/03/1992",
            LabeledText = "CAN CUOC CONG DAN...",
            Fields = new Dictionary<string, string>
            {
                ["id"] = "001099002233",
                ["name"] = "Nguyễn Văn Demo",
                ["dob"] = "12/03/1992",
                ["address"] = "Phường 1, Quận 3"
            },
            IsLabeled = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-5)
        };

        var sample2 = new MockSample
        {
            Id = _nextSampleId++,
            DocumentTypeId = cccdFull.Id,
            FileName = "cccd_back_demo.jpg",
            UploadedBy = "thu.tran",
            UploadedAt = DateTimeOffset.UtcNow.AddDays(-6),
            PreviewUrl = SamplePreviewPlaceholders[2],
            Status = "Pending",
            OcrPreview = "Noi thuong tru: 12 Tran Hung Dao, Q1",
            SuggestedFields = new Dictionary<string, string>
            {
                ["address"] = "12 Trần Hưng Đạo, Q1"
            },
            IsLabeled = false,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-6)
        };

        cccdFull.Samples.Add(sample1);
        cccdFull.Samples.Add(sample2);

        cccdFull.TrainingJobs.Add(new MockTrainingJob
        {
            Id = _nextTrainingJobId++,
            DocumentTypeId = cccdFull.Id,
            Mode = "FAST",
            Status = "Completed",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-4),
            CompletedAt = DateTimeOffset.UtcNow.AddDays(-4).AddHours(1),
            Summary = "Tối ưu whitelist cho số định danh. CER giảm 3% so với baseline."
        });

        var hoKhau = new MockDocumentType
        {
            Id = _nextDocTypeId++,
            Code = "HO_KHAU",
            Name = "Sổ hộ khẩu",
            Description = "Ảnh chụp sổ hộ khẩu truyền thống",
            PreferredMode = OcrMode.Enhanced,
            SchemaJson = "{\n  \"fields\": [\"householdId\", \"owner\", \"address\"]\n}",
            OcrConfigJson = "{\n  \"contrast\": \"clahe\",\n  \"denoise\": true\n}",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-40),
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-12)
        };

        hoKhau.Templates.Add(new MockTemplate
        {
            Id = _nextTemplateId++,
            DocumentTypeId = hoKhau.Id,
            Version = "v1",
            Description = "Template beta cho hộ khẩu",
            AnchorsJson = "{\n  \"header\": \"SO HO KHAU\"\n}",
            FieldsJson = "{\n  \"owner\": { \"regex\": \"Chu ho: (.*)\" }\n}",
            IsActive = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-15)
        });

        hoKhau.Samplers.Add(new MockSampler
        {
            Id = _nextSamplerId++,
            DocumentTypeId = hoKhau.Id,
            Code = "HK_CORE",
            Name = "Thông tin lõi",
            Fields = new List<string> { "householdId", "owner" },
            IsActive = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-14)
        });

        hoKhau.Samples.Add(new MockSample
        {
            Id = _nextSampleId++,
            DocumentTypeId = hoKhau.Id,
            FileName = "ho_khau_demo.jpg",
            UploadedBy = "lam.nguyen",
            UploadedAt = DateTimeOffset.UtcNow.AddDays(-13),
            PreviewUrl = SamplePreviewPlaceholders[3],
            Status = "Labeled",
            OcrPreview = "SO HO KHAU\nChu ho: TRAN VAN A",
            LabeledText = "SO HO KHAU...",
            Fields = new Dictionary<string, string>
            {
                ["householdId"] = "123456789",
                ["owner"] = "Trần Văn A",
                ["address"] = "123 Lê Lợi, Đống Đa"
            },
            IsLabeled = true,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-10)
        });

        hoKhau.TrainingJobs.Add(new MockTrainingJob
        {
            Id = _nextTrainingJobId++,
            DocumentTypeId = hoKhau.Id,
            Mode = "ENHANCED",
            Status = "Completed",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-11),
            CompletedAt = DateTimeOffset.UtcNow.AddDays(-11).AddHours(2),
            Summary = "Fine-tune PP-OCR threshold, cải thiện recall anchor."
        });

        var cccdId = new MockDocumentType
        {
            Id = _nextDocTypeId++,
            Code = "CCCD_ID",
            Name = "CCCD mặt trước",
            Description = "Chỉ nhận dạng mặt trước CCCD",
            PreferredMode = OcrMode.Fast,
            SchemaJson = "{\n  \"fields\": [\"id\", \"name\"]\n}",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-5),
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-2)
        };

        cccdId.Samples.Add(new MockSample
        {
            Id = _nextSampleId++,
            DocumentTypeId = cccdId.Id,
            FileName = "cccd_front_light.jpg",
            UploadedBy = "minh.pham",
            UploadedAt = DateTimeOffset.UtcNow.AddDays(-3),
            PreviewUrl = SamplePreviewPlaceholders[4],
            Status = "Pending",
            OcrPreview = "SO: 012345678901\nHo ten: LE THI B",
            SuggestedFields = new Dictionary<string, string>
            {
                ["id"] = "012345678901",
                ["name"] = "Lê Thị B"
            },
            IsLabeled = false,
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-3)
        });

        _docTypes.Add(cccdFull);
        _docTypes.Add(hoKhau);
        _docTypes.Add(cccdId);
    }

    private static readonly string[] SamplePreviewPlaceholders =
    {
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><rect width='480' height='320' fill='%23f2f4f8'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23555'>Sample</text></svg>",
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><rect width='480' height='320' fill='%23e8f0ff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%233366ff'>CCCD Front</text></svg>",
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><rect width='480' height='320' fill='%23fff4e5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23ff6600'>CCCD Back</text></svg>",
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><rect width='480' height='320' fill='%23f0fff4'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2300aa55'>Hộ khẩu</text></svg>",
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><rect width='480' height='320' fill='%23f9f0ff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%238700d7'>CCCD Light</text></svg>"
    };
}

public sealed class MockDocumentType
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public OcrMode PreferredMode { get; set; } = OcrMode.Auto;
    public string? SchemaJson { get; set; }
    public string? OcrConfigJson { get; set; }
    public string? OnnxConfigJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<MockTemplate> Templates { get; } = new();
    public List<MockSampler> Samplers { get; } = new();
    public List<MockSample> Samples { get; } = new();
    public List<MockTrainingJob> TrainingJobs { get; } = new();
}

public sealed class MockTemplate
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string Version { get; set; } = "v1";
    public string? Description { get; set; }
    public string AnchorsJson { get; set; } = "{}";
    public string FieldsJson { get; set; } = "{}";
    public bool IsActive { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public TemplateTestResult? LastTest { get; set; }
}

public sealed class MockSampler
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string> Fields { get; set; } = new();
    public bool IsActive { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class MockSample
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = "admin";
    public DateTimeOffset UploadedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public string Status { get; set; } = "Pending";
    public bool IsLabeled { get; set; }
    public string? PreviewUrl { get; set; }
    public string? OcrPreview { get; set; }
    public string? LabeledText { get; set; }
    public Dictionary<string, string> Fields { get; set; } = new();
    public Dictionary<string, string>? SuggestedFields { get; set; }
    public string? Notes { get; set; }
}

public sealed class MockTrainingJob
{
    public int Id { get; set; }
    public int DocumentTypeId { get; set; }
    public string Mode { get; set; } = "FAST";
    public string Status { get; set; } = "Completed";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Summary { get; set; } = string.Empty;
}

public sealed class TemplateTestResult
{
    public int SampleId { get; set; }
    public string SampleFileName { get; set; } = string.Empty;
    public bool Passed { get; set; }
    public string Summary { get; set; } = string.Empty;
    public Dictionary<string, string> Fields { get; set; } = new();
    public DateTimeOffset TestedAt { get; set; }
}

public sealed class DocTypeUpsertRequest
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string PreferredMode { get; set; } = "AUTO";
    public string? SchemaJson { get; set; }
    public string? OcrConfigJson { get; set; }
    public string? OnnxConfigJson { get; set; }
}

public sealed class TemplateUpsertRequest
{
    public string Version { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AnchorsJson { get; set; } = "{}";
    public string FieldsJson { get; set; } = "{}";
    public bool IsActive { get; set; }
}

public sealed class TemplateTestRequest
{
    public int SampleId { get; set; }
}

public sealed class SamplerUpsertRequest
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string>? Fields { get; set; }
    public bool IsActive { get; set; }
}

public sealed class SampleCreateRequest
{
    public string FileName { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = string.Empty;
}

public sealed class SampleLabelRequest
{
    public string? LabeledText { get; set; }
    public Dictionary<string, string>? Fields { get; set; }
    public string? Notes { get; set; }
}

public sealed class TrainingRequest
{
    public string Mode { get; set; } = "FAST";
    public string? Notes { get; set; }
}
