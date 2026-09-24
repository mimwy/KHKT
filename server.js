/*
=============================================================
MAP YOUR LIBRARY - SERVER.JS
BẢN ĐÃ THÊM CHỨC NĂNG CHIA SẺ PROJECT
=============================================================

Dựa trên server.js hiện tại của bạn.

Chức năng mới:
1. Mỗi project có share_token.
2. POST /api/projects/:id/share
   -> tạo/lấy link chia sẻ.
3. POST /api/projects/:id/unshare
   -> hủy link chia sẻ.
4. GET /api/shared-project/:token
   -> người ngoài có thể lấy dữ liệu project bằng token.
5. GET /view/:token
   -> mở trang viewer.html.

Lưu ý:
- Viewer vẫn cần được tạo ở bước tiếp theo.
- Link chỉ đọc ở tầng API public; API PUT/DELETE project vẫn yêu cầu
  đăng nhập và kiểm tra user_id.
- Database cũ được tự động migrate thêm share_token.
=============================================================
*/

const express = require('express');
let sqlite3 = null;
const { Pool } = require('pg');
const PgSession = require('connect-pg-simple')(require('express-session'));
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// CẤU HÌNH
// =====================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USE_POSTGRES = !!process.env.DATABASE_URL;

if (!USE_POSTGRES) {
    sqlite3 = require('sqlite3').verbose();
}

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
                share_token TEXT,

                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Thêm cột share_token cho database SQLite cũ nếu chưa có.
        sqliteDB.all(`PRAGMA table_info(projects)`, (err, columns) => {
            if (err) {
                console.error('Lỗi kiểm tra cột projects:', err.message);
                return;
            }

            const hasShareToken = columns.some(
                column => column.name === 'share_token'
            );

            if (!hasShareToken) {
                sqliteDB.run(
                    `ALTER TABLE projects ADD COLUMN share_token TEXT`,
                    (alterErr) => {
                        if (alterErr) {
                            console.error(
                                'Lỗi thêm share_token vào SQLite:',
                                alterErr.message
                            );
                        } else {
                            console.log(
                                'Đã thêm cột share_token vào SQLite.'
                            );
                        }
                    }
                );
            }

            sqliteDB.run(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_token
                ON projects(share_token)
            `);
        });
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                share_token TEXT UNIQUE
            )
        `);

        // Đảm bảo database PostgreSQL cũ cũng có cột share_token.
        await pgPool.query(`
            ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE
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
// SHARE TOKEN
// =====================================================

function generateShareToken() {
    return crypto.randomBytes(24).toString('hex');
}

function getShareBaseUrl(req) {
    const protocol =
        req.headers['x-forwarded-proto'] ||
        req.protocol ||
        'http';

    const host = req.get('host');

    return `${protocol}://${host}`;
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
// PROJECTS - CHIA SẺ
// =====================================================

app.post('/api/projects/:id/share', async (req, res) => {
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
            SELECT id, name, share_token
            FROM projects
            WHERE id = ?
            AND user_id = ?
        `);

        const project = await dbGet(
            projectQuery,
            [req.params.id, user.id]
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message:
                    'Không tìm thấy dự án hoặc bạn không có quyền chia sẻ'
            });
        }

        let shareToken = project.share_token;

        if (!shareToken) {
            shareToken = generateShareToken();

            const updateQuery = sql(`
                UPDATE projects
                SET share_token = ?
                WHERE id = ?
                AND user_id = ?
            `);

            await dbRun(updateQuery, [
                shareToken,
                req.params.id,
                user.id
            ]);
        }

        const shareUrl =
            `${getShareBaseUrl(req)}/view/${shareToken}`;

        res.json({
            success: true,
            share_token: shareToken,
            share_url: shareUrl
        });

    } catch (err) {
        console.error('Lỗi tạo link chia sẻ:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể tạo link chia sẻ'
        });
    }
});


// =====================================================
// PROJECTS - HỦY CHIA SẺ
// =====================================================

app.post('/api/projects/:id/unshare', async (req, res) => {
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

        const updateQuery = sql(`
            UPDATE projects
            SET share_token = NULL
            WHERE id = ?
            AND user_id = ?
        `);

        const result = await dbRun(
            updateQuery,
            [
                req.params.id,
                user.id
            ]
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message:
                    'Không tìm thấy dự án hoặc bạn không có quyền hủy chia sẻ'
            });
        }

        res.json({
            success: true,
            message: 'Đã hủy link chia sẻ'
        });

    } catch (err) {
        console.error('Lỗi hủy chia sẻ:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể hủy link chia sẻ'
        });
    }
});


// =====================================================
// PROJECTS - XEM PROJECT ĐƯỢC CHIA SẺ
// =====================================================

app.get('/api/shared-project/:token', async (req, res) => {
    try {
        const projectQuery = sql(`
            SELECT
                id,
                name,
                canvas_data,
                created_at,
                updated_at
            FROM projects
            WHERE share_token = ?
        `);

        const project = await dbGet(
            projectQuery,
            [req.params.token]
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Link chia sẻ không tồn tại hoặc đã bị hủy'
            });
        }

        res.json({
            success: true,
            project
        });

    } catch (err) {
        console.error('Lỗi lấy project chia sẻ:', err);

        res.status(500).json({
            success: false,
            message: 'Không thể tải dự án được chia sẻ'
        });
    }
});


// =====================================================
// VIEWER PAGE
// =====================================================

app.get('/view/:token', (req, res) => {
    res.sendFile(
        path.join(__dirname, 'public', 'viewer.html')
    );
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