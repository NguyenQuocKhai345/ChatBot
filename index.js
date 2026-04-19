require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const csv = require('csv-parser');
const { OpenAI } = require('openai');
const { PayOS: PayOSClass } = require('@payos/node');

// ==========================================
// 1. CHUẨN BỊ DỮ LIỆU, AI & PAYOS
// ==========================================
const payos = new PayOSClass(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

// Nạp menu vào 2 dạng: text cho AI, object cho tra cứu nhanh
let menuText = '';
const menuItems = {};

fs.createReadStream('Menu.csv')
    .pipe(csv())
    .on('data', (row) => {
        if (row.available && row.available.toLowerCase() === 'true') {
            menuText += `+ [${row.name}] | Size M: ${row.price_m}đ | Size L: ${row.price_l}đ\n`;
            menuItems[row.name.toLowerCase()] = { price_m: row.price_m, price_l: row.price_l };
        }
    })
    .on('end', () => console.log('✅ Đã nạp xong dữ liệu Menu!'));

// Lưu trạng thái session của từng user
// Cấu trúc: { chatId: { history: [], orderInfo: null } }
const userSessions = {};
const pendingOrders = {};

function getSession(chatId) {
    if (!userSessions[chatId]) {
        userSessions[chatId] = { history: [], orderInfo: null };
    }
    return userSessions[chatId];
}

// ==========================================
// 2. KHỞI TẠO TELEGRAM BOT
// ==========================================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    // Reset session khi bắt đầu lại
    userSessions[chatId] = { history: [], orderInfo: null };
    bot.sendMessage(chatId,
        '🧋 Chào con! Mẹ là chủ Tiệm Trà Sữa Của Mẹ đây!\n\n' +
        'Hôm nay con muốn uống gì nào? Con cứ nhắn tên món, size và topping mong muốn nhé~'
    );
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;
    console.log(`[Khách ${chatId}]: ${text}`);

    const session = getSession(chatId);
    session.history.push({ role: 'user', content: text });

    const systemPrompt = {
        role: 'system',
        content: `Bạn là một người nhân viên đang bán trà sữa online qua Telegram.
        Xưng "Mình", gọi khách là "bạn". Trả lời ngắn gọn, thân thiện, dùng emoji vừa phải.

        --- MENU ---
        ${menuText}
        ------------

        QUY TẮC:
        1. Chỉ báo giá đúng theo menu. Không bịa giá.
        2. Hỏi size (M/L) nếu khách chưa chọn. Hỏi topping nếu khách muốn thêm.
        3. Trước khi chốt đơn, BẮT BUỘC hỏi đủ 3 thông tin nếu chưa có:
        - Tên khách
        - Số điện thoại
        - Địa chỉ giao hàng (hoặc hỏi tự đến lấy không)
        4. Khi đã có đủ tên/SĐT/địa chỉ và khách xác nhận đơn, hỏi thêm:
        "Bạn muốn thanh toán chuyển khoản QR hay tiền mặt khi nhận hàng ạ?"

        5. Sau khi khách chọn hình thức thanh toán, tóm tắt lại đơn và THÊM ĐÚNG 1 TRONG 2 DÒNG vào CUỐI CÙNG:
        - Nếu khách chọn chuyển khoản / QR / online: [CHOT_DON|tổng_tiền]
        - Nếu khách chọn tiền mặt / COD / khi nhận:  [CHOT_COD|tổng_tiền]

        Ví dụ: [CHOT_DON|75000] hoặc [CHOT_COD|75000]

        6. Sau khi có đủ thông tin, xác nhận lại toàn bộ thông tin với khách gồm:
        - tên
        - món đã chọn (kèm size, topping nếu có)
        - tổng tiền
        - số điện thoại
        - địa chỉ giao hàng (hoặc phương án lấy hàng)
        

        KHÔNG thêm mã chốt đơn nếu chưa có đủ tên, SĐT, địa chỉ, khách chưa xác nhận đơn VÀ chưa chọn hình thức thanh toán.`
    };

    const messages = [systemPrompt, ...session.history];

    try {
        bot.sendChatAction(chatId, 'typing');

        const completion = await openai.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            temperature: 0.3,
        });

        let botReply = completion.choices[0].message.content;
        const chotDonMatch = botReply.match(/\[CHOT_DON\|(\d+)\]/);
        const chotCodMatch = botReply.match(/\[CHOT_COD\|(\d+)\]/);

        if (chotDonMatch) {
            // ── THANH TOÁN QR / CHUYỂN KHOẢN ──
            const amount = parseInt(chotDonMatch[1], 10);

            if (amount < 2000) {
                bot.sendMessage(chatId, 'Hình như có một số vấn đề, bạn vui lòng nhắn lại đơn giúp mình nhé! 😅');
                return;
            }

            botReply = botReply.replace(/\[CHOT_DON\|\d+\]/, '').trim();
            await bot.sendMessage(chatId, botReply);
            session.history.push({ role: 'assistant', content: botReply });

            const orderCode = Date.now() % 9000000 + 1000000;
            pendingOrders[orderCode] = chatId;

            const paymentData = {
                orderCode: orderCode,
                amount: amount,
                description: `Tra sua #${orderCode}`,
                cancelUrl: `https://t.me/${process.env.BOT_USERNAME || 'bot'}`,
                returnUrl: `https://t.me/${process.env.BOT_USERNAME || 'bot'}`
            };

            await bot.sendMessage(chatId, '⏳ Mình đang tạo mã QR thanh toán, bạn chờ xíu nhé...');

            const paymentLink = await payos.paymentRequests.create(paymentData);
            await bot.sendMessage(chatId,
                `Bạn bấm link bên dưới để mở trang thanh toán & quét QR nhé:\n${paymentLink.checkoutUrl}\n\n` +
                `Mã đơn: #${orderCode} | Tổng: ${amount.toLocaleString('vi-VN')}đ`
            );

        } else if (chotCodMatch) {
            // ── THANH TOÁN TIỀN MẶT KHI NHẬN HÀNG (COD) ──
            const amount = parseInt(chotCodMatch[1], 10);

            botReply = botReply.replace(/\[CHOT_COD\|\d+\]/, '').trim();
            await bot.sendMessage(chatId, botReply);
            session.history.push({ role: 'assistant', content: botReply });

            const orderCode = Date.now() % 9000000 + 1000000;

            await bot.sendMessage(chatId,
                `Mình đã ghi đơn rồi nhé!\n` +
                `Mã đơn: #${orderCode} | Tổng: ${amount.toLocaleString('vi-VN')}đ\n` +
                `Bạn chuẩn bị tiền mặt thanh toán khi nhận hàng nha~`
            );

            console.log(`[ĐƠN COD] #${orderCode} | chatId: ${chatId} | Tiền: ${amount.toLocaleString('vi-VN')}đ`);

        } else {
            session.history.push({ role: 'assistant', content: botReply });
            await bot.sendMessage(chatId, botReply);
        }

    } catch (error) {
        console.error(`[Lỗi chatId ${chatId}]:`, error.message);
        bot.sendMessage(chatId, 'Mình đang bận tay xíu, bạn nhắn lại sau nhé! 😥');
    }
});

bot.on('polling_error', (err) => console.error('[Polling Error]:', err.message));

// ==========================================
// 3. EXPRESS SERVER & WEBHOOK PAYOS
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
app.listen(PORT, () => {
    console.log(` Server đang chạy tại http://localhost:${PORT}`);
});