# Python OCR Service

Dịch vụ OCR chạy bằng Python phục vụ nghiên cứu hệ thống quản lý khoản vay. Service hỗ trợ hai chế độ OCR:

- **FAST (Tesseract)**: nhanh, phù hợp tài liệu rõ nét.
- **ENHANCED (PaddleOCR)**: chính xác hơn cho tài liệu scan khó.

Kết quả OCR, ảnh trung gian và lịch sử xử lý được lưu trong SQLite.

## Tính năng chính

- Nhận diện nhiều định dạng tài liệu: ảnh (PNG/JPEG/TIFF/WEBP), PDF (scan/text) và Word (DOC/DOCX).
- Tự động chuyển DOC/DOCX sang PDF bằng LibreOffice headless, sau đó render ảnh độ phân giải 300 DPI để OCR.
- Chuỗi tiền xử lý ảnh tối ưu cho OCR: grayscale → khử nhiễu (fastNlMeans) → CLAHE → sharpen → adaptive threshold.
- Lưu lại ảnh gốc, ảnh trang và ảnh sau tiền xử lý cho từng lần chạy.
- Thực thi đồng thời hai engine (Tesseract & PaddleOCR) ở chế độ `auto`, chọn kết quả có độ tin cậy trung bình cao nhất.
- REST API (FastAPI) để upload tài liệu, lấy kết quả, và tra cứu lịch sử.
- Lưu lịch sử, ảnh và kết quả vào SQLite (`python_service_data/ocr_history.sqlite`).

## Cấu trúc

```
python_service/
  main.py                # FastAPI entry point
  requirements.txt
  ocr_service/
    config.py            # Đọc biến môi trường & cấu hình
    database.py          # SQLAlchemy ORM + session helper
    storage.py           # Quản lý thư mục lưu trữ
    preprocess.py        # Tiền xử lý ảnh với OpenCV
    document_processor.py# Chuyển đổi định dạng, tách trang
    engines.py           # Wrapper cho Tesseract & PaddleOCR
    service.py           # Điều phối pipeline, ghi log lịch sử
```

Tất cả dữ liệu được lưu dưới `python_service_data/run_<id>/` gồm `uploads/`, `intermediates/`, `outputs/`.

## Chạy cục bộ (không Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r python_service/requirements.txt
# Cài đặt hệ thống: tesseract-ocr, poppler-utils, libreoffice
uvicorn python_service.main:app --reload --port 8000
```

Kiểm tra sức khỏe: `curl http://localhost:8000/health`

Gửi tài liệu OCR:

```bash
curl -X POST "http://localhost:8000/ocr" \
  -F "file=@/path/to/document.pdf" \
  -F "mode=auto"
```

## Docker

Dockerfile cài đặt đầy đủ thư viện hệ thống cần thiết: Tesseract OCR, Poppler (PDF → ảnh) và LibreOffice (DOCX → PDF).

```bash
cd python_service
docker build -t python-ocr-service .
docker run -it --rm -p 8000:8000 -v $(pwd)/data:/app/python_service_data python-ocr-service
```

## Biến môi trường

| Biến | Mặc định | Mô tả |
| --- | --- | --- |
| `OCR_TESS_LANGUAGES` | `vie+eng` | Ngôn ngữ cho Tesseract |
| `OCR_TESS_PSM` | `6` | Page segmentation mode |
| `OCR_TESS_OEM` | `1` | OCR engine mode |
| `OCR_PADDLE_LANG` | `en` | Ngôn ngữ của PaddleOCR |
| `OCR_PADDLE_USE_GPU` | `false` | Bật GPU nếu có |
| `OCR_DB_URL` | `sqlite:///python_service_data/ocr_history.sqlite` | Chuỗi kết nối SQLite |
| `OCR_STORAGE_ROOT` | `python_service_data` | Thư mục lưu file |

## Lưu ý chất lượng

- Với tài liệu scan chất lượng thấp, nên dùng `mode=enhanced` để tận dụng PaddleOCR.
- Có thể tinh chỉnh các bước tiền xử lý trong `preprocess.py` (tham số CLAHE, kernel sharpen, adaptive threshold).
- Để cải thiện tốc độ, preload PaddleOCR (đã thực hiện khi lần đầu gọi).
- Database lưu toàn bộ lịch sử kèm độ tin cậy trung bình theo từng engine cho việc benchmark nội bộ.

