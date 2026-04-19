const fs = require('fs');
const csv = require('csv-parser');

function loadMenu() {
    return new Promise((resolve) => {
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
            .on('end', () => {
                console.log('Đã nạp xong dữ liệu Menu!');
                resolve({ menuText, menuItems });
            });
    });
}

module.exports = { loadMenu };