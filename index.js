require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Đường dẫn này dùng để Zalo trả mã Authorization Code về cho bạn
app.get('/callback', async (req, res) => {
    const { code } = req.query; // Zalo sẽ gửi mã 'code' về đây

    if (!code) return res.send("Không tìm thấy Authorization Code.");

    try {
        // Gửi yêu cầu đổi 'code' lấy 'Access Token'
        const response = await axios({
            method: 'post',
            url: 'https://oauth.zalo.me/v2.0/oa/access_token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'secret_key': process.env.ZALO_APP_SECRET
            },
            data: new URLSearchParams({
                'code': code,
                'app_id': process.env.ZALO_APP_ID,
                'grant_type': 'authorization_code'
            }).toString()
        });

        console.log("--- CHÚC MỪNG! BẠN ĐÃ LẤY ĐƯỢC TOKEN ---");
        console.log(response.data);

        // Trả kết quả ra màn hình trình duyệt để bạn copy lưu lại
        res.json({
            message: "Lấy Token thành công! Hãy lưu lại Refresh Token.",
            data: response.data
        });
    } catch (error) {
        console.error("Lỗi đổi token:", error.response ? error.response.data : error.message);
        res.status(500).json(error.response ? error.response.data : "Lỗi hệ thống");
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server EasyEduV2 đang chạy tại port ${process.env.PORT}`);
});