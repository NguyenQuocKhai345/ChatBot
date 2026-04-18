require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const csv = require('csv-parser');
const { OpenAI } = require('openai');

// ==========================================
// 1. CHUẨN BỊ DỮ LIỆU & AI
// ==========================================
const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});
let menuText = '';

// Đọc file CSV và chuyển thành chuỗi văn bản
fs.createReadStream('Menu.csv')
    .pipe(csv())
    .on('data', (row) => {
        // Chỉ lấy những món có sẵn (available = True)
        if (row.available && row.available.toLowerCase() === 'true') {
            menuText += `- ${row.name} (Size M: ${row.price_m}đ, Size L: ${row.price_l}đ) - Mô tả: ${row.description}\n`;
        }
    })
    .on('end', () => {
        console.log(' Đã nạp xong dữ liệu Menu vào bộ nhớ!');
    });

// Bộ nhớ tạm lưu lịch sử chat của từng khách hàng
const userSessions = {};

// ==========================================
// 2. KHỞI TẠO TELEGRAM BOT
// ==========================================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    // Khởi tạo/Reset lại bộ nhớ cho khách này
    userSessions[chatId] = [];
    bot.sendMessage(chatId, 'Chào bạn! Mình là chat bot tự động của quán trà sữa, bạn muốn gọi món gì hôm nay? 😊');
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === '/start') return;

    console.log(`[Khách ${chatId}]: ${text}`);

    // Khởi tạo session nếu khách chưa gõ /start bao giờ
    if (!userSessions[chatId]) {
        userSessions[chatId] = [];
    }

    // 1. Thêm tin nhắn của khách vào lịch sử
    userSessions[chatId].push({ role: 'user', content: text });

    // 2. Xây dựng System Prompt (Định hình tính cách và nạp Menu)
    const systemPrompt = {
        role: 'system',
        content: `Bạn là một ngườu nhân viên bán hàng ở tiệm trà sữa và đang chat qua mạng với khách (thường là học sinh/sinh viên hoặc dân văn phòng).
        - Xưng hô: "Mình", gọi khách là "bạn". Giọng điệu thân thiện, ấm áp, nhiệt tình.
        - QUY TẮC BÁO GIÁ VÀ TƯ VẤN (TUYỆT ĐỐI TUÂN THỦ):
            1. BẠN CHỈ ĐƯỢC PHÉP lấy giá chính xác từ danh sách MENU dưới đây. 
            2. KHÔNG ĐƯỢC TỰ BỊA GIÁ, KHÔNG ĐƯỢC LẤY GIÁ MÓN NÀY RÂU ÔNG NỌ CẮM CẰM BÀ KIA.
            3. Nếu khách gọi món KHÔNG CÓ trong menu, hãy xin lỗi và bảo mẹ không bán món đó.
        - Dưới đây là Menu của quán (CHỈ tư vấn những món trong này):
        ${menuText}
        - Nhiệm vụ: Tư vấn món, hỏi khách muốn uống size gì (M hay L), có dặn dò gì thêm không (đá/đường).
        - Khi khách gọi món, tra cứu Menu và báo giá CHÍNH XÁC.
        - Khi khách đã chốt đầy đủ món và size, hãy tính tổng tiền thật chính xác và hỏi khách có muốn thanh toán luôn chưa.
        - Trả lời ngắn gọn, tự nhiên, giống tin nhắn chat chứ không viết văn dài dòng.`
    };

    // Chuẩn bị mảng tin nhắn gửi cho OpenAI (Gồm System Prompt + Lịch sử chat)
    const messages = [systemPrompt, ...userSessions[chatId]];

    try {
        // Báo cho khách biết bot đang "gõ chữ"
        bot.sendChatAction(chatId, 'typing');

        // Gọi OpenAI
        const completion = await openai.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            temperature: 0.7,
        });

        const botReply = completion.choices[0].message.content;

        // 3. Lưu câu trả lời của AI vào lịch sử và gửi cho khách
        userSessions[chatId].push({ role: 'assistant', content: botReply });
        bot.sendMessage(chatId, botReply);

    } catch (error) {
        console.error('Lỗi OpenAI:', error.message);
        bot.sendMessage(chatId, 'Mình đang bận tay pha trà xíu, bạn nhắn lại sau một lát nhé! 😥');
    }
});

bot.on('polling_error', (error) => {
    console.error('Lỗi Polling (Mạng):', error.code, error.message);
});

// ==========================================
// 3. KHỞI TẠO EXPRESS SERVER
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.post('/payos-webhook', (req, res) => {
    console.log('Nhận webhook payOS:', req.body);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` Express server đang chạy tại http://localhost:${PORT}`);
});