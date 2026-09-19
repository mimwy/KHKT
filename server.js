const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const PgSession = require('connect-pg-simple')(require('express-session'));
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// CẤU HÌNH
// =====================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USE_POSTGRES = !!process.env.DATABASE_URL;

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    'development-secret-change-this-before-production';


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (IS_PRODUCTION) {
    app.set('trust proxy', 1);
}


// =====================================================
// DATABASE
// =====================================================

let sqliteDB = null;
let pgPool = null;


// =====================================================
// SQLITE - DÙNG KHI CHẠY LOCAL
// =====================================================

function initSQLite() {
    sqliteDB = new sqlite3.Database(
        path.join(__dirname, 'users.db'),
        (err) => {
            if (err) {
                console.error('Lỗi kết nối SQLite:', err.message);
            } else {
                console.log('Đã kết nối SQLite.');
            }
        }
    );

    sqliteDB.serialize(() => {
        sqliteDB.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                fullname TEXT,
                email TEXT,
                phone TEXT
            )
        `);

        sqliteDB.run(`
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
    });
}


// =====================================================
// POSTGRESQL - DÙNG TRÊN RENDER
// =====================================================

async function initPostgres() {
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: IS_PRODUCTION
            ? { rejectUnauthorized: false }
            : false
    });

    try {
        await pgPool.query('SELECT NOW()');

        console.log('Đã kết nối PostgreSQL.');

        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                fullname TEXT,
                email TEXT,
                phone TEXT
            )
        `);

        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                canvas_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Đã kiểm tra/tạo bảng PostgreSQL.');
    } catch (err) {
        console.error('Lỗi PostgreSQL:', err.message);
        throw err;
    }
}


// =====================================================
// KHỞI TẠO DATABASE
// =====================================================

if (USE_POSTGRES) {
    initPostgres().catch((err) => {
        console.error('Không thể khởi tạo PostgreSQL.');
        console.error(err);
    });
} else {
    initSQLite();
}


// =====================================================
// SESSION
// =====================================================

const sessionOptions = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
        maxAge: 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: IS_PRODUCTION
    }
};


// Khi chạy Render + PostgreSQL:
// lưu session trực tiếp vào PostgreSQL
if (USE_POSTGRES) {
    sessionOptions.store = new PgSession({
        pool: pgPool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    });
}

app.use(session(sessionOptions));


// =====================================================
// STATIC FILES
// =====================================================

app.use(express.static(path.join(__dirname, 'public')));


// =====================================================
// HÀM DATABASE
// =====================================================

function sqliteGet(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDB.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}


function sqliteAll(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDB.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}


function sqliteRun(query, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDB.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    lastID: this.lastID,
                    changes: this.changes
                });
            }
        });
    });
}


async function dbGet(query, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(query, params);
        return result.rows[0];
    }

    return sqliteGet(query, params);
}


async function dbAll(query, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(query, params);
        return result.rows;
    }

    return sqliteAll(query, params);
}


async function dbRun(query, params = []) {
    if (USE_POSTGRES) {
        const result = await pgPool.query(query, params);

        return {
            changes: result.rowCount,
            rows: result.rows
        };
    }

    return sqliteRun(query, params);
}


// =====================================================
// SQL PLACEHOLDER
// =====================================================

function sql(query) {
    if (USE_POSTGRES) {
        let index = 0;

        return query.replace(/\?/g, () => {
            index++;
            return `$${index}`;
        });
    }

    return query;
}


// =====================================================
// TRANG CHỦ
// =====================================================

app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }

    res.sendFile(
        path.join(__dirname, 'public', 'index.html')
    );
});


// =====================================================
// REGISTER PAGE
// =====================================================

app.get(['/register', '/register.html'], (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'register.html')
    );
});


// =====================================================
// LOGIN PAGE
// =====================================================

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'login.html')
    );
});


// =====================================================
// DASHBOARD
// =====================================================

app.get(['/dashboard', '/dashboard.html'], (req, res) => {
    if (req.session && req.session.user) {
        return res.sendFile(
            path.join(__dirname, 'public', 'dashboard.html')
        );
    }

    res.redirect('/login');
});


// =====================================================
// API USER
// =====================================================

app.get('/api/user', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'Chưa đăng nhập'
        });
    }

    try {
        const query = sql(`
            SELECT username, fullname, email, phone
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            query,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                error: 'Không tìm thấy người dùng'
            });
        }

        res.json(user);
    } catch (err) {
        console.error('Lỗi lấy user:', err);

        res.status(500).json({
            error: 'Lỗi database',
            detail: err.message
        });
    }
});


// =====================================================
// CẬP NHẬT USER
// =====================================================

app.post('/api/user/update', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    const { fullname, email, phone } = req.body;

    try {
        const query = sql(`
            UPDATE users
            SET fullname = ?,
                email = ?,
                phone = ?
            WHERE username = ?
        `);

        await dbRun(query, [
            fullname || '',
            email || '',
            phone || '',
            req.session.user
        ]);

        res.json({
            success: true,
            message: 'Cập nhật thông tin thành công!'
        });
    } catch (err) {
        console.error('Lỗi cập nhật user:', err);

        res.status(500).json({
            success: false,
            message: 'Lỗi cập nhật CSDL'
        });
    }
});


// =====================================================
// ĐỔI MẬT KHẨU
// =====================================================

app.post('/api/user/change-password', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    const {
        oldPassword,
        newPassword
    } = req.body;

    if (!oldPassword || !newPassword) {
        return res.json({
            success: false,
            message: 'Vui lòng điền đầy đủ mật khẩu cũ và mới!'
        });
    }

    try {
        const query = sql(`
            SELECT password
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            query,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tài khoản!'
            });
        }

        const isMatch = await bcrypt.compare(
            oldPassword,
            user.password
        );

        if (!isMatch) {
            return res.json({
                success: false,
                message: 'Mật khẩu hiện tại không chính xác!'
            });
        }

        const newHashedPassword = await bcrypt.hash(
            newPassword,
            10
        );

        const updateQuery = sql(`
            UPDATE users
            SET password = ?
            WHERE username = ?
        `);

        await dbRun(updateQuery, [
            newHashedPassword,
            req.session.user
        ]);

        res.json({
            success: true,
            message: 'Đổi mật khẩu thành công!'
        });

    } catch (err) {
        console.error('Lỗi đổi mật khẩu:', err);

        res.status(500).json({
            success: false,
            message: 'Lỗi xử lý hệ thống!'
        });
    }
});


// =====================================================
// ĐĂNG KÝ
// =====================================================

app.post('/register', async (req, res) => {
    const {
        username,
        password
    } = req.body;

    if (!username || !password) {
        return res.status(400).send(
            'Vui lòng điền đầy đủ thông tin! <a href="/register">Thử lại</a>'
        );
    }

    try {
        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        const query = sql(`
            INSERT INTO users
            (username, password, fullname, email, phone)
            VALUES (?, ?, ?, ?, ?)
        `);

        await dbRun(query, [
            username,
            hashedPassword,
            username,
            '',
            ''
        ]);

        req.session.regenerate((err) => {
            if (err) {
                console.error('Lỗi tạo session:', err);

                return res.status(500).send(
                    'Không thể tạo phiên đăng nhập!'
                );
            }

            req.session.user = username;

            req.session.save((err) => {
                if (err) {
                    console.error(
                        'Lỗi lưu session:',
                        err
                    );

                    return res.status(500).send(
                        'Không thể lưu phiên đăng nhập!'
                    );
                }

                res.redirect('/dashboard');
            });
        });

    } catch (err) {
        console.error('Lỗi đăng ký:', err);

        if (
            err.message &&
            (
                err.message.includes('UNIQUE') ||
                err.message.includes('unique')
            )
        ) {
            return res.send(
                'Tên đăng nhập đã tồn tại! <a href="/register">Thử lại</a>'
            );
        }

        res.status(500).send(
            'Có lỗi xảy ra trong quá trình đăng ký. <a href="/register">Thử lại</a>'
        );
    }
});


// =====================================================
// ĐĂNG NHẬP
// =====================================================

app.post('/login', async (req, res) => {
    const {
        username,
        password
    } = req.body;

    if (!username || !password) {
        return res.status(400).send(
            'Vui lòng nhập tên đăng nhập và mật khẩu! <a href="/login">Thử lại</a>'
        );
    }

    try {
        const query = sql(`
            SELECT *
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            query,
            [username]
        );

        if (!user) {
            return res.send(
                'Tài khoản hoặc mật khẩu không đúng! <a href="/login">Thử lại</a>'
            );
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.send(
                'Tài khoản hoặc mật khẩu không đúng! <a href="/login">Thử lại</a>'
            );
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error(
                    'Lỗi tạo session:',
                    err
                );

                return res.status(500).send(
                    'Không thể tạo phiên đăng nhập!'
                );
            }

            req.session.user = user.username;

            req.session.save((err) => {
                if (err) {
                    console.error(
                        'Lỗi lưu session:',
                        err
                    );

                    return res.status(500).send(
                        'Không thể lưu phiên đăng nhập!'
                    );
                }

                res.redirect('/dashboard');
            });
        });

    } catch (err) {
        console.error('Lỗi đăng nhập:', err);

        res.status(500).send(
            'Lỗi hệ thống khi xác thực!'
        );
    }
});


// =====================================================
// LOGOUT
// =====================================================

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(
                'Lỗi khi đăng xuất:',
                err
            );

            return res.status(500).send(
                'Không thể đăng xuất'
            );
        }

        res.clearCookie('connect.sid');

        res.redirect('/login');
    });
});


// =====================================================
// PROJECTS - LẤY DANH SÁCH
// =====================================================

app.get('/api/projects', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    try {
        const userQuery = sql(`
            SELECT id
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            userQuery,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const projectQuery = sql(`
            SELECT
                id,
                name,
                canvas_data,
                created_at,
                updated_at
            FROM projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
        `);

        const projects = await dbAll(
            projectQuery,
            [user.id]
        );

        res.json({
            success: true,
            projects
        });

    } catch (err) {
        console.error('Lỗi lấy projects:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể lấy danh sách dự án'
        });
    }
});


// =====================================================
// PROJECTS - TẠO PROJECT MỚI
// =====================================================

app.post('/api/projects', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    const {
        name,
        canvas_data
    } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            message: 'Tên dự án không được để trống'
        });
    }

    try {
        const userQuery = sql(`
            SELECT id
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            userQuery,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        if (USE_POSTGRES) {
            const result = await pgPool.query(
                `
                INSERT INTO projects
                (user_id, name, canvas_data)
                VALUES ($1, $2, $3)
                RETURNING id, name, canvas_data, created_at, updated_at
                `,
                [
                    user.id,
                    name,
                    canvas_data || null
                ]
            );

            return res.json({
                success: true,
                project: result.rows[0]
            });
        }

        const result = await dbRun(
            `
            INSERT INTO projects
            (user_id, name, canvas_data)
            VALUES (?, ?, ?)
            `,
            [
                user.id,
                name,
                canvas_data || null
            ]
        );

        const project = await dbGet(
            `
            SELECT *
            FROM projects
            WHERE id = ?
            `,
            [result.lastID]
        );

        res.json({
            success: true,
            project
        });

    } catch (err) {
        console.error('Lỗi tạo project:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể tạo dự án'
        });
    }
});


// =====================================================
// PROJECTS - CẬP NHẬT
// =====================================================

app.put('/api/projects/:id', async (req, res) => {
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

    try {
        const userQuery = sql(`
            SELECT id
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            userQuery,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const updateQuery = sql(`
            UPDATE projects
            SET
                name = ?,
                canvas_data = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            AND user_id = ?
        `);

        const result = await dbRun(
            updateQuery,
            [
                name,
                canvas_data,
                projectId,
                user.id
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message:
                    'Không tìm thấy dự án hoặc bạn không có quyền chỉnh sửa'
            });
        }

        res.json({
            success: true,
            message: 'Lưu dự án thành công'
        });

    } catch (err) {
        console.error('Lỗi lưu project:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể lưu dự án'
        });
    }
});


// =====================================================
// PROJECTS - XÓA
// =====================================================

app.delete('/api/projects/:id', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập'
        });
    }

    try {
        const userQuery = sql(`
            SELECT id
            FROM users
            WHERE username = ?
        `);

        const user = await dbGet(
            userQuery,
            [req.session.user]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const deleteQuery = sql(`
            DELETE FROM projects
            WHERE id = ?
            AND user_id = ?
        `);

        const result = await dbRun(
            deleteQuery,
            [
                req.params.id,
                user.id
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message:
                    'Không tìm thấy dự án hoặc bạn không có quyền xóa'
            });
        }

        res.json({
            success: true,
            message: 'Xóa dự án thành công'
        });

    } catch (err) {
        console.error('Lỗi xóa project:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể xóa dự án'
        });
    }
});


// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('====================================');
    console.log(`Server đang chạy tại port ${PORT}`);
    console.log(
        USE_POSTGRES
            ? 'Database: PostgreSQL'
            : 'Database: SQLite (local)'
    );
    console.log('====================================');
    console.log('');
});