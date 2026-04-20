const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const { PayOS: PayOSClass } = require('@payos/node');
const Order = require('./models/Order'); // Import Model Database

const payos = new PayOSClass(
    process.env.PAYOS_CLIENT_ID,
    process.env.PAYOS_API_KEY,
    process.env.PAYOS_CHECKSUM_KEY
);

const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const userSessions = {};

function getSession(chatId) {
    if (!userSessions[chatId]) {
        userSessions[chatId] = { history: [], orderInfo: null };
    }
    return userSessions[chatId];
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

function initBot(menuText) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        userSessions[chatId] = { history: [], orderInfo: null };
        bot.sendMessage(chatId,
            'Chào bạn! Mình là chatbot của Tiệm Trà Sữa Của Mẹ !\n\n' +
            'Hôm nay bạn muốn uống gì nào? Bạn cứ nhắn tên món, size và topping mong muốn nhé~'
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

        QUY TẮC (TUYỆT ĐỐI TUÂN THỦ):
        1. Chỉ báo giá đúng theo menu. Không bịa giá.
        2. Hỏi size (M/L) nếu khách chưa chọn. Hỏi topping nếu khách muốn thêm.
        3. Trước khi chốt đơn, BẮT BUỘC hỏi đủ 3 thông tin nếu chưa có: Tên khách, Số điện thoại, Địa chỉ giao hàng.
        4. Khi đã có đủ 3 thông tin trên, hãy xác nhận lại toàn bộ đơn hàng (Tên, SĐT, Địa chỉ, Món ăn, Tổng tiền) với khách.
        5. QUAN TRỌNG: Quán CHỈ nhận thanh toán chuyển khoản trước qua mã QR. Ngay khi khách xác nhận đồng ý chốt đơn, BẠN BẮT BUỘC THÊM ĐÚNG 1 DÒNG NÀY vào CUỐI CÙNG câu trả lời:
        [CHOT_DON|tổng_tiền_bằng_số]

        Ví dụ: [CHOT_DON|75000]

        KHÔNG thêm mã [CHOT_DON] nếu chưa có đủ Tên, SĐT, Địa chỉ HOẶC khách chưa xác nhận đơn.`
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

            if (chotDonMatch) {
                const amount = parseInt(chotDonMatch[1], 10);

                if (amount < 2000) {
                    bot.sendMessage(chatId, 'Hình như có một số vấn đề về giá, bạn vui lòng nhắn lại đơn giúp mình nhé! 😅');
                    return;
                }

                botReply = botReply.replace(/\[CHOT_DON\|\d+\]/, '').trim();
                await bot.sendMessage(chatId, botReply);
                session.history.push({ role: 'assistant', content: botReply });

                const orderCode = Date.now() % 9000000 + 1000000;

                const newOrder = new Order({
                    orderCode: orderCode,
                    chatId: chatId,
                    amount: amount,
                    status: 'PENDING'
                });
                await newOrder.save();

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
                    `👇 Bạn bấm link bên dưới để lấy mã QR quét thanh toán nhé:\n${paymentLink.checkoutUrl}\n\n` +
                    `Mã đơn: #${orderCode} | Tổng: ${amount.toLocaleString('vi-VN')}đ\n` +
                    `(Mình sẽ bắt đầu pha chế ngay khi nhận được thông báo chuyển khoản thành công nha!)`
                );

            } else {
                session.history.push({ role: 'assistant', content: botReply });
                await bot.sendMessage(chatId, botReply);
            }

        } catch (error) {
            console.error(`[Lỗi chatId ${chatId}]:`, error.message);
            bot.sendMessage(chatId, 'Mình đang bận tay xíu, bạn chờ xíu rồi nhắn lại nhé! 😥');
        }
    });

    bot.on('polling_error', (err) => console.error('[Polling Error]:', err.message));
}

// Không xuất pendingOrders nữa
module.exports = { bot, initBot };