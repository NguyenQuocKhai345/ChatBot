require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); // Thêm Mongoose

const { loadMenu } = require('./menu');
const { bot, initBot } = require('./bot');
const Order = require('./models/Order'); // Import Model

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('Bot is running! 🚀'));

app.post('/payos-webhook', async (req, res) => {
    console.log('\n--- WEBHOOK PAYOS ---');

    const { code, data } = req.body;

    if (code === '00' && data) {
        const orderCode = data.orderCode;

        try {
            // Tìm đơn hàng trong MongoDB và cập nhật trạng thái thành PAID
            const order = await Order.findOneAndUpdate(
                { orderCode: orderCode },
                { status: 'PAID' },
                { new: true } // Trả về document sau khi đã update
            );

            if (order) {
                console.log(`[Webhook] Đã cập nhật trạng thái PAID cho đơn #${orderCode}`);
                bot.sendMessage(order.chatId,
                    `🎉 Ting ting! Mình nhận được ${data.amount?.toLocaleString('vi-VN') || ''}đ rồi!\n` +
                    `Đơn #${orderCode} đang được chuẩn bị, mình giao sớm cho bạn nhé! 🧋`
                );
            } else {
                console.warn(`[Webhook] Không tìm thấy đơn #${orderCode} trong Database`);
            }
        } catch (error) {
            console.error('[Lỗi DB Webhook]:', error);
        }
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

async function startApp() {
    try {
        // 1. Kết nối MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Đã kết nối thành công với MongoDB!');

        // 2. Load Menu & Bot
        const { menuText } = await loadMenu();
        initBot(menuText);

        // 3. Chạy Server
        app.listen(PORT, () => {
            console.log(`Server đang chạy tại http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Lỗi khởi động:', error);
    }
}

startApp();