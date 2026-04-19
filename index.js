require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import từ các file đã tách
const { loadMenu } = require('./menu');
const { bot, initBot, pendingOrders } = require('./bot');

// ==========================================
//  EXPRESS SERVER & WEBHOOK PAYOS
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// Health check — Railway/Render cần endpoint này để biết app còn sống
app.get('/', (req, res) => res.send('Bot is running! '));

app.post('/payos-webhook', async (req, res) => {
    console.log('\n--- WEBHOOK PAYOS ---');
    console.log(JSON.stringify(req.body, null, 2));

    const { code, data } = req.body;

    if (code === '00' && data) {
        const orderCode = data.orderCode;
        console.log(`[Webhook] orderCode nhận: ${orderCode} | pendingOrders hiện tại:`, pendingOrders);
        const chatId = pendingOrders[orderCode];

        if (chatId) {
            bot.sendMessage(chatId,
                `🎉 Ting ting! Mình nhận được ${data.amount?.toLocaleString('vi-VN') || ''}đ rồi!\n` +
                `Đơn #${orderCode} đang được chuẩn bị, mình giao sớm cho bạn nhé! 🧋`
            );
            delete pendingOrders[orderCode];
        } else {
            console.warn(`[Webhook] Không tìm thấy chatId cho đơn #${orderCode}`);
        }
    }

    // Luôn trả 200 để payOS không retry
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

// Hàm khởi động đồng bộ để giữ nguyên thứ tự luồng
async function startApp() {
    // 1. Đợi load xong CSV
    const { menuText } = await loadMenu();

    // 2. Nhét menu vào Bot và kích hoạt
    initBot(menuText);

    // 3. Khởi động Webhook
    app.listen(PORT, () => {
        console.log(` Server đang chạy tại http://localhost:${PORT}`);
    });
}

startApp();