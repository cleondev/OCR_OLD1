namespace Ocr.Api.Controllers;

using System;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using Ocr.Api.Mock;

[ApiController]
[Route("api/mock")]
public sealed class AdminMockController : ControllerBase
{
    private readonly AdminMockStore _store;

    public AdminMockController(AdminMockStore store)
    {
        _store = store;
    }

    [HttpGet("doc-types")]
    public IActionResult GetDocTypes()
    {
        var docTypes = _store.GetDocTypes().Select(MapDocTypeSummary);
        return Ok(docTypes);
    }

    [HttpPost("doc-types")]
    public IActionResult CreateDocType([FromBody] DocTypeUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Code và Name không được để trống");
        }

        if (_store.GetDocTypes().Any(dt => string.Equals(dt.Code, request.Code, StringComparison.OrdinalIgnoreCase)))
        {
            return BadRequest("Mã loại tài liệu đã tồn tại");
        }

        var created = _store.CreateDocType(request);
        return Ok(MapDocTypeDetail(created));
    }

    [HttpGet("doc-types/{id:int}")]
    public IActionResult GetDocType(int id)
    {
        var docType = _store.FindDocType(id);
        return docType is null ? NotFound() : Ok(MapDocTypeDetail(docType));
    }

    [HttpPut("doc-types/{id:int}")]
    public IActionResult UpdateDocType(int id, [FromBody] DocTypeUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Tên loại tài liệu không được để trống");
        }

        try
        {
            var updated = _store.UpdateDocType(id, request);
            return Ok(MapDocTypeDetail(updated));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpGet("doc-types/{id:int}/samples")]
    public IActionResult GetSamples(int id)
    {
        var docType = _store.FindDocType(id);
        return docType is null
            ? NotFound()
            : Ok(docType.Samples.Select(MapSample));
    }

    [HttpPost("doc-types/{id:int}/samples")]
    public IActionResult CreateSample(int id, [FromBody] SampleCreateRequest request)
    {
        try
        {
            var sample = _store.CreateSample(id, request);
            return Ok(MapSample(sample));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("samples/{sampleId:int}")]
    public IActionResult GetSample(int sampleId)
    {
        var sample = _store.FindSample(sampleId);
        return sample is null ? NotFound() : Ok(MapSample(sample));
    }

    [HttpPut("samples/{sampleId:int}/label")]
    public IActionResult UpdateSampleLabel(int sampleId, [FromBody] SampleLabelRequest request)
    {
        try
        {
            var updated = _store.UpdateSampleLabel(sampleId, request);
            return Ok(MapSample(updated));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("doc-types/{id:int}/templates")]
    public IActionResult GetTemplates(int id)
    {
        var docType = _store.FindDocType(id);
        return docType is null
            ? NotFound()
            : Ok(docType.Templates.Select(MapTemplate));
    }

    [HttpPost("doc-types/{id:int}/templates")]
    public IActionResult CreateTemplate(int id, [FromBody] TemplateUpsertRequest request)
    {
        try
        {
            var created = _store.CreateTemplate(id, request);
            return Ok(MapTemplate(created));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("templates/{templateId:int}")]
    public IActionResult UpdateTemplate(int templateId, [FromBody] TemplateUpsertRequest request)
    {
        try
        {
            var updated = _store.UpdateTemplate(templateId, request);
            return Ok(MapTemplate(updated));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("doc-types/{docTypeId:int}/templates/{templateId:int}/test")]
    public IActionResult TestTemplate(int docTypeId, int templateId, [FromBody] TemplateTestRequest request)
    {
        try
        {
            var result = _store.TestTemplate(docTypeId, templateId, request);
            return Ok(MapTemplateTest(result));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("doc-types/{id:int}/samplers")]
    public IActionResult GetSamplers(int id)
    {
        var docType = _store.FindDocType(id);
        return docType is null
            ? NotFound()
            : Ok(docType.Samplers.Select(MapSampler));
    }

    [HttpPost("doc-types/{id:int}/samplers")]
    public IActionResult CreateSampler(int id, [FromBody] SamplerUpsertRequest request)
    {
        try
        {
            var created = _store.CreateSampler(id, request);
            return Ok(MapSampler(created));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("samplers/{samplerId:int}")]
    public IActionResult UpdateSampler(int samplerId, [FromBody] SamplerUpsertRequest request)
    {
        try
        {
            var updated = _store.UpdateSampler(samplerId, request);
            return Ok(MapSampler(updated));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("doc-types/{docTypeId:int}/train")]
    public IActionResult TriggerTraining(int docTypeId, [FromBody] TrainingRequest request)
    {
        try
        {
            var job = _store.TriggerTraining(docTypeId, request);
            return Ok(MapTraining(job));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    private static object MapDocTypeSummary(MockDocumentType docType)
        => new
        {
            docType.Id,
            docType.Code,
            docType.Name,
            docType.Description,
            PreferredMode = docType.PreferredMode.ToString().ToUpperInvariant(),
            docType.SchemaJson,
            docType.OcrConfigJson,
            docType.OnnxConfigJson,
            docType.CreatedAt,
            docType.UpdatedAt,
            Stats = new
            {
                Samples = docType.Samples.Count,
                Labeled = docType.Samples.Count(s => s.IsLabeled),
                Templates = docType.Templates.Count,
                Samplers = docType.Samplers.Count
            },
            ActiveTemplate = docType.Templates.FirstOrDefault(t => t.IsActive)?.Version,
            LastTraining = docType.TrainingJobs
                .OrderByDescending(t => t.CompletedAt ?? t.CreatedAt)
                .Select(MapTraining)
                .FirstOrDefault()
        };

    private static object MapDocTypeDetail(MockDocumentType docType)
        => new
        {
            docType.Id,
            docType.Code,
            docType.Name,
            docType.Description,
            PreferredMode = docType.PreferredMode.ToString().ToUpperInvariant(),
            docType.SchemaJson,
            docType.OcrConfigJson,
            docType.OnnxConfigJson,
            docType.CreatedAt,
            docType.UpdatedAt,
            Templates = docType.Templates.Select(MapTemplate).ToList(),
            Samplers = docType.Samplers.Select(MapSampler).ToList(),
            Samples = docType.Samples.Select(MapSample).ToList(),
            TrainingJobs = docType.TrainingJobs
                .OrderByDescending(t => t.CompletedAt ?? t.CreatedAt)
                .Select(MapTraining)
                .ToList()
        };

    private static object MapTemplate(MockTemplate template)
        => new
        {
            template.Id,
            template.DocumentTypeId,
            template.Version,
            template.Description,
            template.AnchorsJson,
            template.FieldsJson,
            template.IsActive,
            template.UpdatedAt,
            LastTest = template.LastTest is null ? null : MapTemplateTest(template.LastTest)
        };

    private static object MapTemplateTest(TemplateTestResult result)
        => new
        {
            result.SampleId,
            result.SampleFileName,
            result.Passed,
            result.Summary,
            result.Fields,
            result.TestedAt
        };

    private static object MapSampler(MockSampler sampler)
        => new
        {
            sampler.Id,
            sampler.DocumentTypeId,
            sampler.Code,
            sampler.Name,
            sampler.Description,
            sampler.Fields,
            sampler.IsActive,
            sampler.UpdatedAt
        };

    private static object MapSample(MockSample sample)
        => new
        {
            sample.Id,
            sample.DocumentTypeId,
            sample.FileName,
            sample.UploadedBy,
            sample.UploadedAt,
            sample.UpdatedAt,
            sample.Status,
            sample.IsLabeled,
            sample.PreviewUrl,
            sample.OcrPreview,
            sample.LabeledText,
            sample.Fields,
            sample.SuggestedFields,
            sample.Notes
        };

    private static object MapTraining(MockTrainingJob job)
        => new
        {
            job.Id,
            job.DocumentTypeId,
            job.Mode,
            job.Status,
            job.CreatedAt,
            job.CompletedAt,
            job.Summary
        };
}
