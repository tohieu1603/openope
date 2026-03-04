// Pre-built workflow templates — auto-seeded when no workflows exist
import type { WorkflowFormState } from "./workflow-types";

export type WorkflowPreset = Omit<WorkflowFormState, "atDatetime"> & { atDatetime?: string };

// Cross-platform preamble removed — agent handles OS detection automatically

// Common preset fields shared across all workflows
const COMMON_FIELDS = {
  enabled: false,
  agentId: "",
  cronExpr: "",
  cronTz: "",
  sessionTarget: "isolated" as const,
  wakeMode: "now" as const,
  payloadKind: "agentTurn" as const,
  postToMainPrefix: "",
  deliveryMode: "none" as const,
  deliveryChannel: "last",
  deliveryTo: "",
  notifyMe: false,
  scheduleKind: "every" as const,
  everyAmount: 24,
  everyUnit: "hours" as const,
};

/**
 * Default workflow presets for Operis.
 * Auto-created on first UI load when workflow list is empty.
 */
export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  // ── 1. Test Excel ──────────────────────────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Test Excel",
    description: "Tạo và sửa file Excel — quản lý nhân sự",
    timeout: 600,
    prompt: `# TEST EXCEL — Quản lý nhân sự

Tạo file Excel "test_excel.xlsx" trong thư mục Desktop với 4 bước tuần tự:

## Bước 1: Tạo bảng trống
- Tạo file Excel mới
- Header dòng 1: STT | Họ Tên | Tuổi | Phòng Ban | Lương (VNĐ)
- Format header: nền xanh đậm (#1B4F72), chữ trắng, bold
- Cột STT rộng 6, Họ Tên rộng 25, Tuổi rộng 8, Phòng Ban rộng 20, Lương rộng 18

## Bước 2: Điền dữ liệu 5 nhân viên
- NV1: Nguyễn Văn An, 28, Kỹ thuật, 15.000.000
- NV2: Trần Thị Bình, 32, Nhân sự, 12.000.000
- NV3: Lê Hoàng Cường, 25, Marketing, 13.500.000
- NV4: Phạm Thị Dung, 30, Kế toán, 14.000.000
- NV5: Hoàng Minh Đức, 35, Giám đốc, 25.000.000
- Format lương: number với dấu phẩy ngàn

## Bước 3: Thêm 3 nhân viên mới + dòng tổng kết
- NV6: Vũ Thị Em, 24, Kỹ thuật, 11.000.000
- NV7: Đặng Văn Phúc, 29, Marketing, 13.000.000
- NV8: Bùi Thị Giang, 27, Nhân sự, 11.500.000
- Tô vàng (#F4D03F) background cho 3 NV mới
- Thêm dòng tổng kết: nền xanh lá (#27AE60), chữ đỏ (#E74C3C), bold
- Tổng kết gồm: Tổng NV, Tổng lương (SUM formula)

## Bước 4: Xóa 3 NV, đánh lại STT, cập nhật tổng
- Xóa NV2 (Trần Thị Bình), NV4 (Phạm Thị Dung), NV6 (Vũ Thị Em)
- Đánh lại STT từ 1 đến 5
- Cập nhật lại công thức SUM cho dòng tổng kết

Lưu file cuối cùng: Desktop/test_excel.xlsx`,
  },

  // ── 2. Test Word ───────────────────────────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Test Word",
    description: "Tạo báo cáo nhân sự Word — format chuyên nghiệp",
    timeout: 600,
    prompt: `# TEST WORD — Báo cáo nhân sự

Tạo file Word "test_word.docx" trong thư mục Desktop với 4 bước tuần tự:

## Bước 1: Tạo tiêu đề
- Tiêu đề: "BÁO CÁO NHÂN SỰ QUÝ II/2025"
- Font: xanh đậm (#1B4F72), cỡ 18, bold, căn giữa
- Thêm dòng phụ: "Phòng Nhân sự — Công ty TNHH Operis"

## Bước 2: Viết nội dung + danh sách 5 nhân viên
- Đoạn mở đầu: tổng quan tình hình nhân sự quý II
- Danh sách 5 NV (bullet list):
  • Nguyễn Văn An — Kỹ thuật — 15.000.000 VNĐ
  • Trần Thị Bình — Nhân sự — 12.000.000 VNĐ
  • Lê Hoàng Cường — Marketing — 13.500.000 VNĐ
  • Phạm Thị Dung — Kế toán — 14.000.000 VNĐ
  • Hoàng Minh Đức — Giám đốc — 25.000.000 VNĐ
- Tổng quỹ lương: 79.500.000 VNĐ

## Bước 3: Thêm 3 NV mới (highlight vàng) + tổng kết (chữ đỏ)
- Thêm mục "Nhân viên mới Quý II":
  • Vũ Thị Em — Kỹ thuật — 11.000.000 VNĐ (highlight vàng)
  • Đặng Văn Phúc — Marketing — 13.000.000 VNĐ (highlight vàng)
  • Bùi Thị Giang — Nhân sự — 11.500.000 VNĐ (highlight vàng)
- Dòng tổng kết: chữ đỏ (#E74C3C), bold
  "Tổng nhân sự: 8 người | Tổng quỹ lương: 115.000.000 VNĐ"

## Bước 4: Cập nhật nghỉ việc + ký tên
- Thêm mục "Nghỉ việc Quý II": Trần Thị Bình, Phạm Thị Dung
- Cập nhật tổng: 6 người, quỹ lương mới
- Phần ký tên cuối trang:
  Bên trái: "Trưởng phòng Nhân sự" + dòng ký
  Bên phải: "Giám đốc" + dòng ký
  Ngày tháng ở giữa

Lưu file cuối cùng: Desktop/test_word.docx`,
  },

  // ── 3. Test Browser ────────────────────────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Test Browser",
    description: "Mở trình duyệt, tìm kiếm Google, vào VnExpress",
    timeout: 600,
    prompt: `# TEST BROWSER — Tìm kiếm & duyệt web

Thực hiện 4 bước duyệt web (chờ 5 giây giữa mỗi bước):

## Bước 1: Mở trình duyệt → vào google.com
- Mở trình duyệt có sẵn trên hệ thống
- Truy cập google.com
- Xác nhận trang đã load thành công

## Bước 2: Tìm "thời tiết Hà Nội hôm nay"
- Nhập vào ô tìm kiếm: "thời tiết Hà Nội hôm nay"
- Enter để tìm
- Ghi lại kết quả: nhiệt độ, trạng thái thời tiết, độ ẩm

## Bước 3: Mở tab mới → vnexpress.net
- Mở tab mới trong trình duyệt
- Truy cập vnexpress.net
- Lấy 5 tiêu đề tin nổi bật trên trang chủ

## Bước 4: Lưu kết quả vào file txt + đóng trình duyệt
- Tạo file "ket_qua_browser.txt" trong thư mục Desktop
- Nội dung file:
  [Ngày giờ chạy]
  --- THỜI TIẾT HÀ NỘI ---
  (kết quả từ bước 2)
  --- TIN TỨC VNEXPRESS ---
  1. (tiêu đề 1)
  2. (tiêu đề 2)
  3. (tiêu đề 3)
  4. (tiêu đề 4)
  5. (tiêu đề 5)
- Đóng trình duyệt

Lưu file kết quả: Desktop/ket_qua_browser.txt`,
  },

  // ── 4. Báo Cáo Tổng Hợp ───────────────────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Báo Cáo Tổng Hợp",
    description: "Thu thập web → tổng hợp Excel → xuất Word",
    timeout: 900,
    prompt: `# BÁO CÁO TỔNG HỢP — Browser + Excel + Word

Thu thập dữ liệu web, tổng hợp vào Excel, xuất báo cáo Word. 6 bước:

## Bước 1: 🌐 Tìm thời tiết TP.HCM
- Mở trình duyệt, tìm "thời tiết TP.HCM hôm nay"
- Ghi lại: nhiệt độ, trạng thái, độ ẩm, dự báo 3 ngày

## Bước 2: 🌐 Tìm tỷ giá USD/VND, EUR/VND
- Tìm "tỷ giá USD VND hôm nay"
- Tìm "tỷ giá EUR VND hôm nay"
- Ghi lại: tỷ giá mua, bán cho cả 2 loại

## Bước 3: 🌐 Lấy 5 tin nổi bật VnExpress
- Truy cập vnexpress.net
- Lấy 5 tin nổi bật: tiêu đề + tóm tắt ngắn

## Bước 4: 📊 Tổng hợp vào Excel (4 sheet)
- Tạo file "bao_cao_tong_hop.xlsx" trong thư mục Desktop
- Sheet "Thời Tiết": bảng dữ liệu thời tiết từ bước 1
  Header: nền xanh dương (#2E86C1), chữ trắng
- Sheet "Tỷ Giá": bảng tỷ giá từ bước 2
  Header: nền xanh lá (#27AE60), chữ trắng
- Sheet "Tin Tức": 5 tin từ bước 3 (STT, Tiêu đề, Tóm tắt)
  Header: nền cam (#E67E22), chữ trắng
- Sheet "Tổng Kết": tóm tắt tất cả (thời tiết 1 dòng, tỷ giá 1 dòng, 5 tin 1 dòng/tin)
  Header: nền đỏ đậm (#C0392B), chữ trắng

## Bước 5: 📄 Xuất báo cáo Word (4 mục + ký tên)
- Tạo file "bao_cao_tong_hop.docx" trong thư mục Desktop
- Tiêu đề: "BÁO CÁO TỔNG HỢP NGÀY [ngày hôm nay]" (xanh đậm, cỡ 16, bold)
- Mục 1: Thời tiết TP.HCM
- Mục 2: Tỷ giá ngoại tệ
- Mục 3: Tin tức nổi bật
- Mục 4: Nhận xét & đề xuất
- Ký tên: "Người tổng hợp" + ngày tháng

## Bước 6: Tạo file tóm tắt txt
- Tạo "tom_tat.txt" trong thư mục Desktop
- Nội dung ngắn gọn: thời tiết, tỷ giá, 5 tiêu đề tin

Kết quả: Desktop/bao_cao_tong_hop.xlsx, Desktop/bao_cao_tong_hop.docx, Desktop/tom_tat.txt`,
  },

  // ── 5. Marketing Campaign (Tea House) ─────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Marketing Campaign — TEA HOUSE",
    description: "Kế hoạch grand opening thương hiệu trà sữa TEA HOUSE",
    timeout: 1800,
    prompt: `# MARKETING CAMPAIGN — TEA HOUSE Grand Opening
Tông màu chủ đạo: Cam #E67E22 + Đen #2C3E50

Lập kế hoạch marketing grand opening thương hiệu trà sữa TEA HOUSE. 6 bước:

## Bước 1: 🌐 Nghiên cứu đối thủ (5+ thương hiệu)
- Mở trình duyệt, tìm kiếm 3 từ khóa cụ thể:
  • "top thương hiệu trà sữa Việt Nam 2025"
  • "Phúc Long Gong Cha thị phần trà sữa"
  • "xu hướng trà sữa Việt Nam"
- Nghiên cứu 5+ đối thủ: Phúc Long, Gong Cha, Tiger Sugar, Koi Thé, TocoToco
- Mỗi đối thủ: 7 tiêu chí (giá TB, số cửa hàng, USP, TA, marketing style, menu đặc biệt, điểm yếu)
- Ước tính quy mô thị trường trà sữa VN

## Bước 2: 🌐 Phân tích xu hướng + hành vi Gen Z
- Tìm kiếm:
  • "xu hướng đồ uống Gen Z 2025"
  • "TikTok trà sữa viral"
  • Vào TikTok tìm "khai trương trà sữa" → ghi 5 video hot
- 5 xu hướng (kèm ví dụ cụ thể + cách TEA HOUSE áp dụng)
- Phân tích fanpage đối thủ: followers, tần suất post, engagement rate
- Xu hướng healthy/low sugar: cơ hội cho TEA HOUSE

## Bước 3: 📊 Excel marketing_plan.xlsx (4 sheet)
- Lưu trong thư mục Desktop
- Sheet "Thị Trường": tổng quan thị trường + hành vi KH
  Header: nền xanh đậm #1B4F72, chữ trắng
  Bảng quy mô, tăng trưởng, phân khúc

- Sheet "Đối Thủ": 9 cột phân tích chi tiết
  Header: nền cam #E67E22, chữ trắng
  Tô màu xen kẽ trắng/xám cho dễ đọc

- Sheet "SWOT": ma trận 4 ô
  S (xanh lá #27AE60) | W (đỏ #E74C3C)
  O (xanh dương #2E86C1) | T (cam #F39C12)
  Mỗi ô: 3-5 điểm + giải thích + đối sách

- Sheet "Xu Hướng": 3 bảng con (Digital, F&B, GenZ)
  Cột ưu tiên tô màu: Cao=xanh, TB=vàng, Thấp=xám

## Bước 4: 📊 Thêm ngân sách (Goal-Based Budgeting chuẩn Gartner)
- Sheet "Ngân Sách" (4 phần A-B-C-D):
  A: Tổng quan — doanh thu mục tiêu, CAC, tỷ lệ MKT/DT
  B: 3 nhóm kênh:
     Digital (40%): Facebook Ads, Google Ads, TikTok Ads, SEO
     KOL (35%): Mega, Macro, Micro influencer
     Offline (25%): Banner, sampling, event opening
  C: Dự phòng 10% + Tổng ngân sách
  D: ROI dự kiến từng kênh (tô xanh nếu >3x, vàng 1-3x, đỏ <1x)

- Sheet "So Sánh Kênh": % ngân sách vs % khách hàng dự kiến
- Sheet "Timeline": 4 tuần chi tiết (W-1 đến W+2 sau khai trương)

## Bước 5: 📄 Word ke_hoach_marketing.docx
- Lưu trong thư mục Desktop
- Tiêu đề: "KẾ HOẠCH MARKETING — TEA HOUSE GRAND OPENING"
- 7 mục: Thị trường → Đối thủ → SWOT → Chiến lược → Ngân sách → Timeline → KPI
- Mỗi mục trích dẫn số liệu cụ thể từ Excel
- Ký tên: Marketing Manager + Giám đốc

## Bước 6: 🎨 PowerPoint tea_house_pitch.pptx
- Lưu trong thư mục Desktop
- Design system: cam #E67E22 + đen #2C3E50 + trắng
- 8-12 slide pitch deck style, mỗi slide 1 ý chính:
  Bìa → Cơ hội → Thị trường → Đối thủ → SWOT → Chiến lược → Ngân sách → Timeline → KPI → CTA
- Số liệu quan trọng: cỡ 48pt, bold
- Slide bìa: logo TEA HOUSE + tagline

Kết quả: Desktop/marketing_plan.xlsx, Desktop/ke_hoach_marketing.docx, Desktop/tea_house_pitch.pptx`,
  },

  // ── 6. Stock Investment Analysis ───────────────────────────────
  {
    ...COMMON_FIELDS,
    name: "Stock Investment Analysis",
    description: "Phân tích TTCK VN, chọn 5 CP, lập danh mục 500 triệu VND",
    timeout: 1800,
    prompt: `# STOCK INVESTMENT ANALYSIS — Phân tích TTCK Việt Nam
Tông màu: Xanh đậm #1A5276 + Vàng gold #F4D03F
Thư mục kết quả: Desktop/Stock Analysis/ (tạo nếu chưa có)

QUAN TRỌNG:
- Mỗi bước DỰA VÀO dữ liệu bước trước (chuỗi logic)
- Bước 2 TỰ CHỌN cổ phiếu dựa trên phân tích bước 1
- KHÔNG bịa số liệu — chỉ dùng dữ liệu thực tế từ web

## Bước 1: 🌐 Nghiên cứu thị trường
- Mở trình duyệt, tìm kiếm:
  • "VN-Index hôm nay" → chỉ số, % thay đổi, khối lượng GD
  • "HNX Index hôm nay" → tương tự
  • "lãi suất ngân hàng Việt Nam" → lãi suất tiết kiệm 12 tháng
  • "tỷ giá USD VND" → tỷ giá hiện tại
- Tổng hợp: VN-Index, HNX, KLGD, lãi suất, tỷ giá
- Top CP tăng mạnh nhất phiên
- Khối ngoại mua/bán ròng hôm nay
- Ngành dẫn dắt thị trường
→ DỮ LIỆU NÀY LÀ NỀN TẢNG CHO BƯỚC 2

## Bước 2: 🌐 Tự chọn 5 CP tiềm năng
- DỰA VÀO bước 1: top tăng + ngành hot + khối ngoại
- Chọn 5 mã thuộc 5 NGÀNH KHÁC NHAU
- Mỗi mã tìm kiếm chi tiết:
  • Giá hiện tại, P/E, P/B, EPS
  • Tin tức gần nhất (1 tuần)
  • LÝ DO cụ thể chọn mã này
- Ưu tiên: CP ngành dẫn dắt + khối ngoại mua + tăng giá ổn định
→ DỮ LIỆU NÀY LÀ NỀN TẢNG CHO BƯỚC 3

## Bước 3: 📊 Excel phân tích (4 sheet)
- File: Desktop/Stock Analysis/phan_tich_dau_tu.xlsx

- Sheet "Tổng Quan TT": SỐ THỰC từ bước 1
  Header: nền xanh đậm #1A5276, chữ trắng
  Bảng: VN-Index, HNX, KLGD, lãi suất, tỷ giá
  Top tăng/giảm, khối ngoại

- Sheet "5 Cổ Phiếu": SỐ THỰC từ bước 2
  Header: nền vàng gold #F4D03F, chữ đen
  Mỗi CP: mã, tên, ngành, giá, P/E, P/B, EPS, lý do
  Tô xanh nếu P/E < TB ngành, đỏ nếu > TB

- Sheet "So Sánh Ngành": xếp hạng DỰA VÀO vĩ mô bước 1
  So sánh 5 ngành: tăng trưởng, rủi ro, khối ngoại, tiềm năng
  Xếp hạng 1-5 mỗi tiêu chí

- Sheet "Định Giá": khuyến nghị MUA/GIỮ/BÁN
  DỰA VÀO P/E so TB ngành, xu hướng giá, tin tức
  MUA = xanh lá #27AE60, GIỮ = cam #F39C12, BÁN = đỏ #E74C3C
→ KHUYẾN NGHỊ NÀY LÀ NỀN TẢNG CHO BƯỚC 4

## Bước 4: 📊 Excel danh mục + kịch bản (2 sheet thêm)
- Sheet "Danh Mục": phân bổ 500 triệu VND
  CP khuyến nghị MUA → tỷ trọng cao (20-30%)
  CP khuyến nghị GIỮ → tỷ trọng thấp (10-15%)
  CP khuyến nghị BÁN → không mua (0%)
  Tính: số lượng cổ phiếu, giá trị, tỷ trọng %

- Sheet "Kịch Bản": 3 kịch bản
  Lạc quan +10%: nền xanh lá nhạt → giá trị DM mới
  Trung bình ±2%: nền vàng nhạt → giá trị DM mới
  Bi quan -15%: nền đỏ nhạt → giá trị DM mới
  Mỗi kịch bản tính lãi/lỗ tuyệt đối + %
→ PHÂN BỔ NÀY LÀ NỀN TẢNG CHO BƯỚC 5

## Bước 5: 📄 Word báo cáo 7 mục
- File: Desktop/Stock Analysis/bao_cao_dau_tu.docx
- Tiêu đề: "BÁO CÁO PHÂN TÍCH ĐẦU TƯ CHỨNG KHOÁN" (xanh đậm, cỡ 18)
- 7 mục:
  1. Tổng quan thị trường (TRÍCH DẪN số liệu bước 1)
  2. Phân tích vĩ mô (lãi suất, tỷ giá, nhận định)
  3. 5 cổ phiếu tiềm năng (TRÍCH DẪN bước 2)
  4. So sánh ngành (TRÍCH DẪN bước 3)
  5. Khuyến nghị định giá (TRÍCH DẪN bước 3)
  6. Danh mục đề xuất 500 triệu (TRÍCH DẪN bước 4)
  7. Kịch bản & quản lý rủi ro (TRÍCH DẪN bước 4)
- Kết luận: nên đầu tư hay chờ đợi? (dựa trên tất cả dữ liệu)
- Ký tên: "Chuyên viên phân tích" + ngày tháng
→ BÁO CÁO NÀY LÀ NỀN TẢNG CHO BƯỚC 6

## Bước 6: 🎨 PowerPoint 12-15 slide CHUẨN MỰC CAO
- File: Desktop/Stock Analysis/investment_pitch.pptx
- Bảng màu:
  Chính: xanh đậm #1A5276 + vàng gold #F4D03F + trắng + xám nhạt
  Tín hiệu: xanh lá #27AE60 (MUA) / đỏ #E74C3C (BÁN) / cam #F39C12 (GIỮ)
- Số liệu quan trọng: cỡ 48-72pt, vàng gold, bold
- Slides:
  1. Bìa gradient xanh đậm → tên báo cáo + ngày
  2. Tổng quan TT (VN-Index cỡ 72pt vàng gold)
  3. Khối ngoại mua/bán ròng
  4. Ngành dẫn dắt
  5-9. 5 slide CP (mỗi slide: badge MUA/GIỮ/BÁN, giá, P/E, lý do)
  10. Danh mục 500 triệu (biểu đồ tròn tỷ trọng)
  11. 3 kịch bản (3 cột: xanh/vàng/đỏ)
  12. Rủi ro & lưu ý
  13. Kết luận & khuyến nghị

Kết quả tại Desktop/Stock Analysis/:
- phan_tich_dau_tu.xlsx
- bao_cao_dau_tu.docx
- investment_pitch.pptx`,
  },
];
