# OCR Suite (.NET 9 POC)

Hệ thống OCR on-prem hỗ trợ hai chế độ **FAST (Tesseract)** và **ENHANCED (PP-OCR ONNX)** theo hướng dẫn trong `AgentRule.md`.

## Cấu trúc thư mục

```
.
├── src/
│   ├── Ocr.Api/           # ASP.NET Core Minimal API + Test UI
│   ├── Ocr.Core/          # Domain models, abstractions, coordinator
│   ├── Ocr.Storage/       # EF Core (SQLite) context + seed
│   ├── Ocr.Preprocess/    # Image preprocessors (Fast/Enhanced)
│   ├── Ocr.Engines/       # Engine factory + Tesseract & PP-OCR wrappers
│   ├── Ocr.Extractor/     # Regex-based extractor + sampler provider
│   ├── Ocr.Classifier/    # Stub ML.NET classifier loader
│   └── Ocr.Workers/       # Background workers (engine warmup)
├── templates/             # Template + sampler cấu hình JSON
├── models/                # Thư mục chứa tessdata và ONNX (copy thủ công)
├── data/                  # CSDL SQLite (runtime)
├── uploads/               # Tệp upload/labeled
└── scripts/               # Helper scripts (để trống)
```

## Thiết lập

1. Cài [.NET 9 SDK preview](https://dotnet.microsoft.com/).
2. Tạo thư mục model & DB:
   ```bash
   mkdir -p models/tessdata models/onnx data uploads templates
   ```
3. Copy `vie.traineddata`, `eng.traineddata` vào `models/tessdata/`.
4. Copy `ppocrv3_det.onnx`, `ppocrv3_rec.onnx`, `dict.txt` vào `models/onnx/`.
5. Khởi tạo SQLite (file tự tạo khi chạy lần đầu).

## Chạy ứng dụng

```bash
dotnet restore
dotnet build
dotnet run --project src/Ocr.Api
```

Ứng dụng cung cấp:
- **Swagger** tại `/swagger`.
- **UI test nhanh** tại `/test` (upload ảnh, chọn mode/sampler, xem kết quả JSON).
- **REST API** `/api/ocr` (multipart form: `file`, optional `docType`, `sampler`, `mode`).
- **Admin API** `/api/admin/doc-types` (danh sách docType + template active).

## Ghi chú

- `OcrEngineFactory` tự động chọn FAST/ENHANCED theo `OcrMode` yêu cầu hoặc `PreferredMode` của `DocumentType`.
- `SamplerProvider` tải cấu hình từ `templates/samplers.json`.
- `SeedData` tạo sẵn docType `CCCD_FULL` với template regex mẫu.
- Cần tối ưu hoá và tích hợp pipeline PP-OCR thực tế khi có model.

## License

MIT (tùy chỉnh theo nhu cầu).
