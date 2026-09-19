const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'bi-mat-khong-the-ti-lo',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: false
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) console.error('Lỗi kết nối CSDL:', err.message);
    else console.log('Đã kết nối thành công với cơ sở dữ liệu SQLite.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    fullname TEXT,
    email TEXT,
    phone TEXT
)`);

db.run(`
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        canvas_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/register', '/register.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Hỗ trợ cả /dashboard lẫn /dashboard.html
app.get(['/dashboard', '/dashboard.html'], (req, res) => {
    if (req.session && req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/login');
    }
});

app.get('/api/user', (req, res) => {
    console.log("===== KIỂM TRA API USER =====");
    console.log("Session ID:", req.sessionID);
    console.log("Session:", req.session);
    console.log("Username trong session:", req.session?.user);

    if (!req.session || !req.session.user) {
        console.log("KHÔNG CÓ SESSION USER");

        return res.status(401).json({
            error: 'Chưa đăng nhập'
        });
    }

    const query = `
        SELECT username, fullname, email, phone
        FROM users
        WHERE username = ?
    `;

    console.log("Đang tìm user:", req.session.user);

    db.get(query, [req.session.user], (err, user) => {

        if (err) {
            console.error("LỖI SQLITE:", err.message);

            return res.status(500).json({
                error: 'Lỗi SQLite',
                detail: err.message
            });
        }

        if (!user) {
            console.error(
                "KHÔNG TÌM THẤY USER TRONG DATABASE:",
                req.session.user
            );

            return res.status(404).json({
                error: 'Không tìm thấy người dùng'
            });
        }

        console.log("TÌM THẤY USER:", user);

        return res.json(user);
    });
});

app.post('/api/user/update', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const { fullname, email, phone } = req.body;
    const updateQuery = `UPDATE users SET fullname = ?, email = ?, phone = ? WHERE username = ?`;

    db.run(updateQuery, [fullname, email, phone, req.session.user], function (err) {
        if (err) {
            console.error("Lỗi cập nhật CSDL:", err.message);
            return res.status(500).json({ success: false, message: 'Lỗi cập nhật CSDL' });
        }
        res.json({ success: true, message: 'Cập nhật thông tin thành công!' });
    });
});

app.post('/api/user/change-password', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.json({ success: false, message: 'Vui lòng điền đầy đủ mật khẩu cũ và mới!' });
    }

    const query = `SELECT password FROM users WHERE username = ?`;
    db.get(query, [req.session.user], async (err, user) => {
        if (err || !user) {
            return res.status(500).json({ success: false, message: 'Lỗi hệ thống!' });
        }

        try {
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.json({ success: false, message: 'Mật khẩu hiện tại không chính xác!' });
            }

            const newHashedPassword = await bcrypt.hash(newPassword, 10);

            const updatePassQuery = `UPDATE users SET password = ? WHERE username = ?`;
            db.run(updatePassQuery, [newHashedPassword, req.session.user], (updateErr) => {
                if (updateErr) {
                    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật mật khẩu!' });
                }
                res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
            });

        } catch (error) {
            res.status(500).json({ success: false, message: 'Lỗi xử lý hệ thống!' });
        }
    });
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send('Vui lòng điền đầy đủ thông tin! <a href="/register">Thử lại</a>');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = `INSERT INTO users (username, password, fullname, email, phone) VALUES (?, ?, ?, ?, ?)`;
        
        db.run(insertQuery, [username, hashedPassword, username, '', ''], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.send('Tên đăng nhập đã tồn tại! Vui lòng chọn tên khác. <a href="/register">Thử lại</a>');
                }
                console.error("Lỗi SQLite:", err.message);
                return res.status(500).send('Có lỗi xảy ra trong quá trình lưu dữ liệu. <a href="/register">Thử lại</a>');
            }

            req.session.regenerate((err) => {
    if (err) {
        console.error("Lỗi tạo session:", err);
        return res.status(500).send("Không thể tạo phiên đăng nhập!");
    }

    req.session.user = username;

    req.session.save((err) => {
        if (err) {
            console.error("Lỗi lưu session:", err);
            return res.status(500).send("Không thể lưu phiên đăng nhập!");
        }

        return res.redirect('/dashboard');
    });
});
        });

    } catch (error) {
        console.error("Lỗi Server:", error);
        return res.status(500).send('Lỗi máy chủ khi mã hóa mật khẩu!');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send(
            'Vui lòng nhập tên đăng nhập và mật khẩu! <a href="/login">Thử lại</a>'
        );
    }

    const query = `SELECT * FROM users WHERE username = ?`;

    db.get(query, [username], async (err, user) => {
        if (err) {
            console.error("Lỗi SQLite:", err.message);
            return res.status(500).send('Lỗi kết nối CSDL!');
        }

        if (!user) {
            return res.send(
                'Tài khoản hoặc mật khẩu không đúng! <a href="/login">Thử lại</a>'
            );
        }

        try {
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.send(
                    'Tài khoản hoặc mật khẩu không đúng! <a href="/login">Thử lại</a>'
                );
            }

            // Tạo session mới
            req.session.regenerate((err) => {
                if (err) {
                    console.error("Lỗi tạo session:", err);
                    return res.status(500).send("Không thể tạo phiên đăng nhập!");
                }

                req.session.user = user.username;

                // QUAN TRỌNG: Lưu session trước khi redirect
                req.session.save((err) => {
                    if (err) {
                        console.error("Lỗi lưu session:", err);
                        return res.status(500).send("Không thể lưu phiên đăng nhập!");
                    }

                    return res.redirect('/dashboard');
                });
            });

        } catch (error) {
            console.error(error);
            return res.status(500).send(
                'Lỗi hệ thống khi xác thực!'
            );
        }
    });
});

// Bỏ comment route Đăng xuất
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Lỗi khi đăng xuất:', err);
            return res.status(500).send('Không thể đăng xuất');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});

// ==========================================
// LƯU DỰ ÁN
// ==========================================

app.put('/api/projects/:id', (req, res) => {

    // Kiểm tra đăng nhập
    if (!req.session || !req.session.user) {

        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });

    }


    const projectId = req.params.id;

    const {
        name,
        canvas_data
    } = req.body;


    const query = `

        UPDATE projects

        SET
            name = ?,

            canvas_data = ?,

            updated_at = CURRENT_TIMESTAMP

        WHERE
            id = ?

        AND
            user_id = (

                SELECT id

                FROM users

                WHERE username = ?

            )

    `;


    db.run(

        query,

        [
            name,
            canvas_data,
            projectId,
            req.session.user
        ],

        function(err) {

            if (err) {

                console.error(
                    'Lỗi lưu dự án:',
                    err.message
                );

                return res.status(500).json({

                    success: false,

                    message: 'Không thể lưu dự án'

                });

            }


            if (this.changes === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        'Không tìm thấy dự án hoặc bạn không có quyền chỉnh sửa'

                });

            }


            res.json({

                success: true,

                message:
                    'Lưu dự án thành công'

            });

        }

    );

});