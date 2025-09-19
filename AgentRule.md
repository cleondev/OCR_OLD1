# AgentRule.md — Quy tắc & Guide triển khai Hệ thống OCR (.NET 9 + SQLite)

> Tài liệu này là **quy tắc vận hành** cho Agent (Codex/Dev Agent) để hiện thực hệ thống OCR on‑prem với **hai chế độ OCR**
> - **FAST (Tesseract)**: nhanh, nhẹ, dễ tinh chỉnh tiền xử lý.
> - **ENHANCED (ONNXRuntime)**: tăng cường độ chính xác (PP‑OCRv3/TrOCR ONNX), hỗ trợ GPU (CUDA/DirectML).

---

## 0) Mục tiêu, Phạm vi, Không-mục tiêu

### Quy trình Git để tránh conflict

- **Luôn làm việc trên nhánh `main`**: trước khi bắt đầu, kiểm tra `git status -sb` và chắc chắn `## main` đang sạch.
- **Đồng bộ mã nguồn mới nhất**: chạy `git fetch --all` rồi `git pull --rebase` (hoặc `git pull origin main --rebase` nếu đã cấu hình remote). Không commit khi chưa cập nhật với remote.
- **Commits gọn và mạch lạc**: gom các thay đổi có liên quan vào cùng một commit, tránh sửa file thừa gây xung đột.
- **Kiểm tra trước khi commit**: `git status` để đảm bảo chỉ các file cần thiết được thay đổi, xoá file rác hoặc cache.
- **Không tạo nhánh phụ**: tất cả thay đổi phải được commit trực tiếp lên `main` theo yêu cầu khách hàng.

> Nếu phát hiện conflict, quay lại bước đồng bộ (`git pull --rebase`) rồi sửa trước khi commit.

**Mục tiêu**
- Web app on‑prem (ASP.NET Core **.NET 9**) + **SQLite**.
- Hai khu vực chức năng:
  1) **Admin (Training/Labeling/Template/Sampler)**.
  2) **End‑user** (Upload → Classify → Extract → FullText) + **REST API** tích hợp.
- Hỗ trợ **hai chế độ OCR** (FAST/ENHANCED) có thể chọn theo **request**, **docType**, hoặc **appsettings**.
- Dễ mở rộng: thay engine, thêm docType, thêm sampler, thêm model classifier.

**Không-mục tiêu**
- Không bao gồm hạ tầng CI/CD, scaling đa node, SSO/LDAP (có thể thêm sau).
- Không train lại deep‑OCR trong ENHANCED ở giai đoạn POC (sử dụng model ONNX có sẵn).
- Không xây dựng UI SPA phức tạp (dùng Razor Pages hoặc UI tối giản).

---

## 1) Kiến trúc cao cấp

```
[Web UI]  ─┐
[REST API] ├─> Ingest → Preprocess → OCR (FAST/ENHANCED) → Classify → Extract → Validate → Outbox
[Admin UI] ┘                      ↑                     ↑
                           Templates/Samplers      Training/Labeling
```

- **Preprocess** (ImageSharp/OpenCV): deskew, CLAHE, denoise, binarize, sharpen.
- **OCR**: chọn engine theo **OcrMode**: FAST(Tesseract) / ENHANCED(ONNXRuntime).
- **Classifier (tùy chọn)**: ML.NET TF‑IDF + Linear SVM (text OCR) để đoán `docType`.
- **Extractor**: Template (anchors/regex) + Sampler (subset fields) → JSON kết quả.
- **Storage**: SQLite (EF Core) + filesystem cho file ảnh/ONNX/tessdata/templates.

---

## 2) Cấu trúc repo

```
ocr-suite/
  src/
    Ocr.Api/                 # ASP.NET Core (.NET 9) – Minimal API + Admin/Test UI
    Ocr.Core/                # Abstractions, domain models, validators
    Ocr.Storage/             # EF Core (SQLite), entities, migrations
    Ocr.Preprocess/          # ImageSharp/OpenCV ops
    Ocr.Engines/             # Tesseract (FAST) + PpOcrOnnx (ENHANCED)
    Ocr.Extractor/           # Template engine (anchors/regex) + sampler filter
    Ocr.Classifier/          # (optional) ML.NET classifier
    Ocr.Workers/             # Background jobs (train/grid-search)
  templates/                 # JSON templates per docType (versioned)
  models/
    tessdata/                # vie.traineddata, eng.traineddata, ...
    onnx/                    # ppocrv3_det.onnx, ppocrv3_rec.onnx, dict.txt
  data/                      # ocr.sqlite (runtime)
  uploads/                   # sample & processed files
  scripts/                   # ef/train/seed helpers
  tests/
```

---

## 3) App settings & Environment

**`src/Ocr.Api/appsettings.json`**
```json
{
  "Ocr": {
    "DefaultMode": "AUTO",             // AUTO | FAST | ENHANCED
    "Tesseract": {
      "TessdataPath": "models/tessdata",
      "Languages": "vie+eng",
      "Psm": 6,
      "Oem": 1,
      "Whitelist": ""
    },
    "Onnx": {
      "DetModel": "models/onnx/ppocrv3_det.onnx",
      "RecModel": "models/onnx/ppocrv3_rec.onnx",
      "Provider": "CPU",               // CPU | CUDA | DirectML
      "UseGpu": false,
      "ThreadCount": 4
    }
  },
  "ConnectionStrings": {
    "Default": "Data Source=./data/ocr.sqlite"
  }
}
```

**ENV (tuỳ chọn)**  
- `OCR_DefaultMode`, `OCR_Onnx_Provider`, `ASPNETCORE_URLS`.
- Windows GPU: DirectML; NVIDIA: CUDA (yêu cầu CUDA runtime).

---

## 4) Database Schema (EF Core + SQLite)

**Entities chính**
```csharp
public class DocumentType {
  public int Id { get; set; }
  public string Code { get; set; } = default!;       // "CCCD_FULL"
  public string Name { get; set; } = default!;
  public string? SchemaJson { get; set; }            // fields definition
  public string? OcrConfigJson { get; set; }         // preprocess/psm...
  public string PreferredMode { get; set; } = "AUTO";// AUTO|FAST|ENHANCED
  public string? ModelPath { get; set; }             // optional engine model
  public string? OnnxConfigJson { get; set; }        // per-type overrides
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Template {
  public int Id { get; set; }
  public int DocumentTypeId { get; set; }
  public string Version { get; set; } = "v1";
  public string AnchorsJson { get; set; } = "{}";
  public string RegexJson { get; set; } = "{}";
  public string PostProcessJson { get; set; } = "{}";
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
  public DocumentType DocumentType { get; set; } = default!;
}

public class Sampler {
  public int Id { get; set; }
  public int DocumentTypeId { get; set; }
  public string Code { get; set; } = default!;       // "CCCD_ID"
  public string Name { get; set; } = default!;
  public string FieldsJson { get; set; } = "[]";     // ["id","name"]
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
  public DocumentType DocumentType { get; set; } = default!;
}

public class Sample {
  public long Id { get; set; }
  public int DocumentTypeId { get; set; }
  public string FilePath { get; set; } = default!;
  public string? OcrRawText { get; set; }
  public string? LabeledText { get; set; }           // ground truth
  public string? FieldsLabeledJson { get; set; }     // optional per-field
  public string Status { get; set; } = "Uploaded";   // Uploaded|Ocred|Labeled|Trained
  public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
  public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
  public DocumentType DocumentType { get; set; } = default!;
}

public class ProcessedDocument {
  public long Id { get; set; }
  public int? DocumentTypeId { get; set; }
  public string FilePath { get; set; } = default!;
  public string? ClassifiedCode { get; set; }
  public string? OcrText { get; set; }
  public string? ExtractedJson { get; set; }
  public string ModeUsed { get; set; } = "FAST";     // FAST|ENHANCED
  public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
```

**Migrations**
```bash
dotnet ef migrations add InitialCreate -p src/Ocr.Storage -s src/Ocr.Api
dotnet ef database update -p src/Ocr.Storage -s src/Ocr.Api
```

---

## 5) JSON Schema: Template & Sampler

**Template (anchors/regex)**
```json
{
  "doc_type": "CCCD_FULL",
  "version": "v1",
  "anchors": [
    {
      "key": "id",
      "text": ["Số", "ID", "Số CCCD"],
      "search_area": { "x": 0.05, "y": 0.10, "w": 0.90, "h": 0.20 },
      "value_direction": "rightOrBelow",
      "max_distance": 180
    },
    {
      "key": "name",
      "text": ["Họ và tên", "Họ tên", "Full name"],
      "search_area": { "x": 0.05, "y": 0.18, "w": 0.90, "h": 0.30 },
      "value_direction": "rightOrBelow",
      "max_distance": 220
    }
  ],
  "regex": {
    "id": "^\\d{12}$",
    "dob": "^([0-2]\\d|3[01])/(0\\d|1[0-2])/(\\d{4})$",
    "gender": "(Nam|Nữ)"
  },
  "post_process": {
    "normalize_unicode": ["name"],
    "uppercase": []
  }
}
```

**Sampler (subset fields)**
```json
{
  "code": "CCCD_ID",
  "name": "Chỉ số CCCD",
  "fields": ["id"]
}
```

---

## 6) OCR Modes & Factory

**Enum & Factory**
```csharp
public enum OcrMode { AUTO, FAST, ENHANCED }

public interface IOcrEngine {
  Task<OcrResult> RunAsync(Image<Rgba32> img, CancellationToken ct);
}

public interface IOcrEngineFactory {
  IOcrEngine Resolve(OcrMode mode, DocumentType? docType = null);
}
```

**Resolve logic**
- Request `mode` → nếu `AUTO`, ưu tiên `docType.PreferredMode`; nếu chưa có, dùng `Ocr.DefaultMode`; cuối cùng fallback `FAST`.
- Classify bước đầu có thể dùng FAST để tiết kiệm thời gian, sau đó nếu chọn ENHANCED thì **OCR lại** bằng ONNX cho kết quả cuối.

---

## 7) Preprocess per‑mode

- **FAST (Tesseract)**: Grayscale → CLAHE → Bilateral → Adaptive Threshold (Sauvola) → Deskew → Unsharp mask nhẹ.  
  Lưu preset vào `DocumentType.OcrConfigJson` (grid‑search khi train).

- **ENHANCED (ONNX)**: Hạn chế biến đổi mạnh; giữ nguyên bản, resize chuẩn input model, light denoise khi cần.

---

## 8) Endpoints (REST)

### 8.1 Classify
```
POST /api/classify?mode=FAST|ENHANCED|AUTO
FormData: file
Resp: { "docType": "CCCD_FULL", "confidence": 0.92, "mode": "FAST" }
```

### 8.2 Extract
```
POST /api/extract?mode=FAST|ENHANCED|AUTO
FormData: file, sampler (optional), docType (optional)
Resp: {
  "docType": "CCCD_FULL",
  "sampler": "CCCD_ID",
  "mode": "ENHANCED",
  "fields": [ { "name": "id", "value": "012345678901", "confidence": 0.89 } ]
}
```

### 8.3 Fulltext
```
POST /api/ocr?mode=FAST|ENHANCED|AUTO
FormData: file, docType (optional)
Resp: {
  "docType": "CCCD_FULL",
  "mode": "FAST",
  "pages": [ { "fullText": "...\n...", "words": [ { "text":"SO", "bbox":{...}, "conf":0.81 } ] } ]
}
```

### 8.4 Admin – DocTypes / Samples / Templates / Samplers
```
GET  /api/admin/doctypes
POST /api/admin/doctypes
PUT  /api/admin/doctypes/{id}
DEL  /api/admin/doctypes/{id}

POST /api/admin/doctypes/{id}/samples/upload     // FormData: files[]
GET  /api/admin/doctypes/{id}/samples
GET  /api/admin/samples/{sampleId}
PUT  /api/admin/samples/{sampleId}/label         // { labeledText, fieldsLabeledJson? }
POST /api/admin/doctypes/{id}/train              // train/grid‑search FAST params

GET  /api/admin/doctypes/{id}/templates
POST /api/admin/doctypes/{id}/templates
PUT  /api/admin/templates/{tplId}

GET  /api/admin/doctypes/{id}/samplers
POST /api/admin/doctypes/{id}/samplers
PUT  /api/admin/samplers/{samplerId}
```

---

## 9) UI Pages & Flows

### 9.1 Admin UI
- `/admin/doctypes` — danh sách, tạo/sửa (Code, Name, Schema, **PreferredMode**).
- `/admin/doctypes/{id}/samples` — upload, xem trạng thái, mở **label**.
- `/admin/samples/{sampleId}` — **Labeling**: ảnh (zoom) + OCR text (editable) + “By Fields” form → **Save Label**; optional **Re‑OCR (try params)**.
- `/admin/doctypes/{id}/templates` — edit JSON anchors/regex/postprocess + **Test Template** trên OCRtext của sample.
- `/admin/doctypes/{id}/samplers` — tạo/sửa sampler (`fields[]`).
- `/admin/train/{docTypeId}` — trigger grid‑search FAST preprocess/psm/whitelist → cập nhật `OcrConfigJson`.

### 9.2 End‑user Test UI (`/test`)
- Form: **file**, (optional) **docType**, **sampler**, **mode** (AUTO|FAST|ENHANCED).
- Actions: **Recognize** → show `docType`, `mode` used, `fields[]`, nút **View Full Text**, **Download JSON**.
- Gợi ý “Thử ENHANCED” nếu `FAST` tự tin thấp.

---

## 10) Training loop (POC)

1) Admin upload **samples** → hệ thống OCR sơ bộ (FAST).  
2) Admin **label** (`LabeledText` / `FieldsLabeledJson`).  
3) **Grid‑search FAST** preprocess/psm/whitelist để tối ưu khớp với labels → cập nhật `OcrConfigJson`.  
4) (Tùy chọn) Train **Classifier** ML.NET từ `Sample(OcrRawText, DocTypeCode)` → `model.zip`.  
5) **Templates/Samplers**: tinh chỉnh anchors/regex; “Test Template” trên sample holdout.  
6) End‑user sử dụng: nếu **PreferredMode=ENHANCED** cho docType khó, engine sẽ tự chuyển ONNX.

---

## 11) Bảo mật & Phân quyền

- Roles: `Admin`, `User`.  
- `/api/admin/**` + `/admin/**` → require `Admin`.  
- Public APIs `/api/**`: nếu mở rộng, bật API‑Key/JWT + rate‑limit.  
- Lưu audit tối thiểu: create/update template, train, label events.

---

## 12) Hiệu năng, Logging, Quan trắc

- Log thời gian từng bước: preprocess, ocr (engine, provider), extract.  
- Metric: accuracy per field, classify accuracy, OCR char error rate (CER).  
- Thử **FAST vs ENHANCED** với cùng ảnh để ra **benchmark nội bộ**.  
- Cache warm‑up engines khi app khởi động.

---

## 13) Acceptance & Quality Gates

- **OCR FullText** (FAST) đọc đúng ≥ 85% trên ảnh scan rõ.  
- **ENHANCED** cải thiện đáng kể ảnh mờ/xiên (so với FAST).  
- **Extract (Template+Sampler)** trả đúng trường bắt buộc (CCCD: `id`, `name`, `dob`) trên ≥ 90% mẫu thử chuẩn.  
- **AUTO mode** tôn trọng `docType.PreferredMode`.  
- Endpoints **200/400** hành vi đúng, multipart upload ổn định, SQLite file lock an toàn.

---

## 14) Lệnh chạy & khởi tạo

```bash
# Build & run
dotnet build
dotnet run --project src/Ocr.Api

# DB
dotnet ef migrations add InitialCreate -p src/Ocr.Storage -s src/Ocr.Api
dotnet ef database update -p src/Ocr.Storage -s src/Ocr.Api

# Thư mục yêu cầu
mkdir -p models/tessdata models/onnx data uploads templates
# Copy vie.traineddata vào models/tessdata/
# Copy ppocrv3_det.onnx, ppocrv3_rec.onnx (+ dict) vào models/onnx/
```

---

## 15) Troubleshooting

- **Tesseract not found / bad language**: sai `TessdataPath` hoặc thiếu `vie.traineddata`.  
- **ONNX provider error**: thiếu CUDA runtime / DirectML không hỗ trợ card → dùng `CPU`.  
- **OCR ra rác**: thử giảm/enhance preprocess; với ENHANCED, hạn chế threshold mạnh.  
- **Template không bắt được field**: kiểm tra `anchors.text`, `search_area`, `value_direction`, `regex`.  
- **SQLite locked**: bảo đảm không chia sẻ file qua network share; dùng 1 process.

---

## 16) Lộ trình mở rộng

- Bbox overlay trong Labeling UI (từ Tesseract iterator/ONNX det).  
- Active‑learning: auto đẩy low‑confidence vào hàng chờ label.  
- Nâng cấp Classifier ML.NET + Word layout features.  
- Hỗ trợ PDF/DOCX → ảnh (PDFium/LibreOffice).  
- Audit chi tiết & versioning template/sampler.

---

## 17) Do / Don’t cho Agent

**Do**
- Luôn cho phép chọn **mode** (AUTO/FAST/ENHANCED) ở API & UI test.  
- Tôn trọng `docType.PreferredMode`; mặc định `FAST` nếu chưa rõ.  
- Lưu config per‑docType trong DB (`OcrConfigJson`), templates/samplers versioned.  
- Ghi log thời gian, engine provider, confidence để so sánh.

**Don’t**
- Không hard‑code đường dẫn model – dùng config.  
- Không biến đổi ảnh quá mạnh ở ENHANCED.  
- Không xóa sample/labeled data khi train lại.

---

## 18) Checklist thực thi (theo thứ tự)

1) Tạo solution, projects đúng cấu trúc.  
2) Thêm packages (EF, ImageSharp, OpenCV, Tesseract, OnnxRuntime, ML.NET).  
3) Implement Entities, DbContext, Migration.  
4) Implement Preprocess (FAST/ENHANCED presets).  
5) Implement `TesseractEngineService` & `PpOcrOnnxService`.  
6) Implement `IOcrEngineFactory` + resolve logic.  
7) Implement Extractor (anchors/regex) + Sampler filter.  
8) Map REST endpoints (classify/extract/ocr + admin).  
9) Dựng Admin UI (docType, samples, labeling, templates, samplers, train).  
10) Dựng Test UI (upload + mode + sampler + fulltext).  
11) Seed 1 docType (CCCD_FULL), 1 template, 2 samplers (CCCD_FULL/CCCD_ID).  
12) Benchmark FAST vs ENHANCED, ghi lại số liệu.  
13) Viết README vận hành & hướng dẫn copy model.

---

> **Hoàn tất.** Agent bám sát quy tắc trên để triển khai POC chạy được end‑to‑end, sau đó cải tiến dần (classifier, overlay bbox, PDF/DOCX pipeline, GPU).

