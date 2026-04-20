# AI Milk Tea Order Bot 🧋

Dự án Chatbot hỗ trợ tự động hóa việc đặt món cho quán trà sữa, giải quyết tình trạng quá tải tin nhắn và sai sót thông tin trong quá trình vận hành thủ công.

## 🌟 Tổng quan
Bài toán đặt ra là hỗ trợ một quán trà sữa xử lý các đơn hàng online. Hệ thống được xây dựng như một "bản sao AI", có khả năng giao tiếp tự nhiên, ghi nhớ thông tin khách hàng, tự động tính tiền và tạo link thanh toán qua QR Code.

## 🚀 Các tính năng chính
- **Giao tiếp thông minh:** Sử dụng LLM (Groq API) để hiểu ngữ cảnh, trích xuất thực thể (tên món, số lượng, topping) từ hội thoại tự nhiên.
- **Quản lý Menu:** Đọc và xử lý dữ liệu menu từ file `.csv`, cho phép cập nhật giá và sản phẩm linh hoạt.
- **Cơ chế Chốt đơn (Token Trigger):** Tự động phát hiện ý định mua hàng thông qua quy tắc `[CHOT_DON|tổng_tiền]` giúp đồng bộ dữ liệu giữa AI và Backend.
- **Thanh toán tự động:** Tích hợp PayOS để tạo mã QR thanh toán nhanh chóng, giúp giảm thiểu sai sót khi kiểm tra giao dịch thủ công.
- **Trạng thái hội thoại:** Sử dụng MongoDB và Session management để duy trì ngữ cảnh đơn hàng của từng khách hàng.

## 🛠 Công nghệ sử dụng
- **Runtime:** Node.js, Express.js
- **AI/LLM:** Groq API (Llama 3)
- **Database:** MongoDB (Mongoose ORM)
- **Messaging:** Telegram Bot API 
- **Payment:** PayOS API
- **Data Processing:** CSV Parsing

## 📂 Kiến trúc hệ thống
1. **Tiếp nhận:** Telegram Webhook gửi tin nhắn đến Server.
2. **Xử lý:** Server kết hợp System Prompt + History + Menu gửi lên LLM để phân tích.
3. **Logic:** AI trả về kết quả; nếu khách chốt đơn, Backend nhận tín hiệu, lưu đơn vào MongoDB và tạo link thanh toán.
4. **Phản hồi:** Bot gửi tin nhắn xác nhận kèm Link QR cho khách hàng.

## ⚙️ Hướng dẫn cài đặt

### Cài đặt thư viện
npm install

### Chạy project
npm start

### 1. Yêu cầu hệ thống
- Node.js (v18+)
- MongoDB Atlas (hoặc local instance)
- API Keys: Telegram, Groq, PayOS

### 2. Cấu hình
Tạo file `.env` từ file mẫu `.env.example` và điền các thông tin:
```env
BOT_TOKEN=nhập_token_của_bot_vào_đây
OWNER_CHAT_ID=nhập_chat_id_của_bạn_vào_đây
GROQ_API_KEY=nhập_api_key_groq_vào_đây
PAYOS_CLIENT_ID=nhập_client_id_vào_đây
PAYOS_API_KEY=nhập_api_key_vào_đây
PAYOS_CHECKSUM_KEY=nhập_checksum_key_vào_đây
MONGODB_URI=nhập_URL_DATABASE
PORT=3000
```

## LINK DEMO bot @TiemTraSuaCuaMe_bot
https://drive.google.com/file/d/1wTbT2XXDc3oWcOlYPoyrtoGBs7ldAIAb/view