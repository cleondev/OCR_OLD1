namespace Ocr.Api.Mock;

using System;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

public static class AdminMockEndpointExtensions
{
    public static void MapAdminMockEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/mock");

        group.MapGet("/doc-types", (AdminMockStore store) =>
        {
            var docTypes = store.GetDocTypes().Select(MapDocTypeSummary);
            return Results.Ok(docTypes);
        });

        group.MapPost("/doc-types", (AdminMockStore store, DocTypeUpsertRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("Code và Name không được để trống");
            }

            if (store.GetDocTypes().Any(dt => string.Equals(dt.Code, request.Code, StringComparison.OrdinalIgnoreCase)))
            {
                return Results.BadRequest("Mã loại tài liệu đã tồn tại");
            }

            var created = store.CreateDocType(request);
            return Results.Ok(MapDocTypeDetail(created));
        });

        group.MapGet("/doc-types/{id:int}", (int id, AdminMockStore store) =>
        {
            var docType = store.FindDocType(id);
            return docType is null ? Results.NotFound() : Results.Ok(MapDocTypeDetail(docType));
        });

        group.MapPut("/doc-types/{id:int}", (int id, AdminMockStore store, DocTypeUpsertRequest request) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("Tên loại tài liệu không được để trống");
            }

            try
            {
                var updated = store.UpdateDocType(id, request);
                return Results.Ok(MapDocTypeDetail(updated));
            }
            catch (InvalidOperationException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });

        group.MapGet("/doc-types/{id:int}/samples", (int id, AdminMockStore store) =>
        {
            var docType = store.FindDocType(id);
            return docType is null
                ? Results.NotFound()
                : Results.Ok(docType.Samples.Select(MapSample));
        });

        group.MapPost("/doc-types/{id:int}/samples", (int id, AdminMockStore store, SampleCreateRequest request) =>
        {
            try
            {
                var sample = store.CreateSample(id, request);
                return Results.Ok(MapSample(sample));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapGet("/samples/{sampleId:int}", (int sampleId, AdminMockStore store) =>
        {
            var sample = store.FindSample(sampleId);
            return sample is null ? Results.NotFound() : Results.Ok(MapSample(sample));
        });

        group.MapPut("/samples/{sampleId:int}/label", (int sampleId, AdminMockStore store, SampleLabelRequest request) =>
        {
            try
            {
                var updated = store.UpdateSampleLabel(sampleId, request);
                return Results.Ok(MapSample(updated));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapGet("/doc-types/{id:int}/templates", (int id, AdminMockStore store) =>
        {
            var docType = store.FindDocType(id);
            return docType is null
                ? Results.NotFound()
                : Results.Ok(docType.Templates.Select(MapTemplate));
        });

        group.MapPost("/doc-types/{id:int}/templates", (int id, AdminMockStore store, TemplateUpsertRequest request) =>
        {
            try
            {
                var created = store.CreateTemplate(id, request);
                return Results.Ok(MapTemplate(created));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapPut("/templates/{templateId:int}", (int templateId, AdminMockStore store, TemplateUpsertRequest request) =>
        {
            try
            {
                var updated = store.UpdateTemplate(templateId, request);
                return Results.Ok(MapTemplate(updated));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapPost("/doc-types/{docTypeId:int}/templates/{templateId:int}/test", (int docTypeId, int templateId, AdminMockStore store, TemplateTestRequest request) =>
        {
            try
            {
                var result = store.TestTemplate(docTypeId, templateId, request);
                return Results.Ok(MapTemplateTest(result));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapGet("/doc-types/{id:int}/samplers", (int id, AdminMockStore store) =>
        {
            var docType = store.FindDocType(id);
            return docType is null
                ? Results.NotFound()
                : Results.Ok(docType.Samplers.Select(MapSampler));
        });

        group.MapPost("/doc-types/{id:int}/samplers", (int id, AdminMockStore store, SamplerUpsertRequest request) =>
        {
            try
            {
                var created = store.CreateSampler(id, request);
                return Results.Ok(MapSampler(created));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapPut("/samplers/{samplerId:int}", (int samplerId, AdminMockStore store, SamplerUpsertRequest request) =>
        {
            try
            {
                var updated = store.UpdateSampler(samplerId, request);
                return Results.Ok(MapSampler(updated));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        group.MapPost("/doc-types/{docTypeId:int}/train", (int docTypeId, AdminMockStore store, TrainingRequest request) =>
        {
            try
            {
                var job = store.TriggerTraining(docTypeId, request);
                return Results.Ok(MapTraining(job));
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
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
            LastTraining = docType.TrainingJobs.OrderByDescending(t => t.CompletedAt ?? t.CreatedAt).Select(MapTraining).FirstOrDefault()
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
            TrainingJobs = docType.TrainingJobs.OrderByDescending(t => t.CompletedAt ?? t.CreatedAt).Select(MapTraining).ToList()
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
