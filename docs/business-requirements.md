# Phân tích yêu cầu nghiệp vụ UI OCR Suite

Tài liệu này tổng hợp lại các yêu cầu nghiệp vụ chính cho khối giao diện quản trị và màn hình kiểm thử end-user của hệ thống OCR Suite. Phần này được dùng làm nguồn tham chiếu khi xây dựng mock UI và API phục vụ việc demo luồng nghiệp vụ.

## 1. Bối cảnh hệ thống

Hệ thống OCR Suite hoạt động on-premise với hai chế độ nhận dạng:

- **FAST (Tesseract)**: tốc độ cao, dành cho tài liệu chất lượng tốt.
- **ENHANCED (PP-OCR ONNX)**: tăng độ chính xác cho tài liệu khó.

Kho dữ liệu quản lý các loại tài liệu (`DocumentType`), mẫu trích xuất (`Template`), mẫu sampler (`Sampler`) và bộ mẫu cần gán nhãn (`DocumentSample`).

## 2. Mục tiêu giao diện quản trị

Giao diện quản trị phục vụ đội vận hành/labeling với các chức năng chính:

1. **Quản lý loại tài liệu (Document Type)**
   - Xem danh sách với các chỉ số: số mẫu, số mẫu đã gán nhãn, template đang hoạt động, lần huấn luyện gần nhất.
   - Tạo, cập nhật thông tin: mã, tên, mô tả, chế độ OCR ưa thích, schema trường dữ liệu, cấu hình OCR.

2. **Quản lý mẫu tài liệu (Samples)**
   - Tải lên và theo dõi trạng thái từng mẫu.
   - Mở màn hình gán nhãn: xem ảnh, xem kết quả OCR thô, nhập fulltext chuẩn, nhập giá trị theo trường, lưu nhãn.
   - Cho phép sử dụng gợi ý OCR và ghi chú nội bộ.

3. **Quản lý template trích xuất**
   - Chỉnh sửa JSON anchors/regex và cấu hình trường.
   - Kiểm thử template trên mẫu có sẵn để xem kết quả khớp trường.
   - Quản lý trạng thái kích hoạt và phiên bản template.

4. **Quản lý sampler**
   - Khai báo sampler theo bộ trường con phục vụ API end-user.
   - Bật/tắt sampler, cập nhật mô tả.

5. **Huấn luyện nhanh (FAST tuning)**
   - Kích hoạt grid-search cho tham số FAST (psm, preprocess, whitelist).
   - Theo dõi lịch sử lần chạy gần nhất và ghi chú kết quả.

## 3. Mục tiêu giao diện kiểm thử end-user (`/test`)

Giao diện kiểm thử dành cho người dùng nghiệp vụ test nhanh pipeline:

- Upload tệp ảnh/PDF, chọn mode OCR (AUTO/FAST/ENHANCED), docType, sampler.
- Nhận kết quả gồm: docType phân loại, chế độ đã dùng, danh sách trường trích xuất, metadata.
- Có nút xem fulltext, tải JSON kết quả.
- Đề xuất chuyển sang ENHANCED nếu chạy FAST nhưng kết quả nghi ngờ (fulltext ngắn, thiếu trường).

## 4. Luồng nghiệp vụ trọng tâm

1. **Tạo loại tài liệu mới** → cấu hình schema/template cơ bản → upload mẫu thử → gán nhãn → test template → huấn luyện FAST.
2. **Gán nhãn mẫu** → lưu fulltext, giá trị trường → đánh dấu hoàn tất → dữ liệu dùng cho huấn luyện/tối ưu.
3. **Tối ưu template** → chỉnh sửa anchors/regex → test với mẫu → ghi lại kết quả test.
4. **Phát hành sampler** → định nghĩa bộ trường con → bật sampler phục vụ API.
5. **Test end-user** → upload tài liệu thực tế → kiểm tra kết quả → tải JSON cho tích hợp.

## 5. Phạm vi mock/demo

Trong phạm vi mock UI/API:

- Dữ liệu được lưu ở bộ nhớ tạm với vài docType mẫu (CCCD_FULL, CCCD_ID, HO_KHAU).
- Cho phép thực hiện đầy đủ thao tác CRUD cần thiết để mô phỏng luồng nghiệp vụ.
- Các API `/api/mock/**` chỉ phục vụ demo UI, không ghi xuống cơ sở dữ liệu thật.
- Các thao tác nặng (huấn luyện, test template) trả về kết quả tức thời với dữ liệu giả lập để hỗ trợ verify giao diện.

