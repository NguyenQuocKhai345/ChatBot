const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderCode: { type: Number, required: true, unique: true },
    chatId: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);