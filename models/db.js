const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const bcrypt  = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'taskora.db');
let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) { console.error('Ошибка БД:', err.message); process.exit(1); }
    });
  }
  return db;
}

function generateInviteCode(name) {
  const prefix = name.replace(/[^a-zA-Z0-9]/g,'').slice(0,4).toUpperCase();
  const suffix = Math.random().toString(36).slice(2,6).toUpperCase();
  return `${prefix}-${suffix}`;
}

function initDb() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.serialize(() => {
      database.run('PRAGMA foreign_keys = ON');

      database.run(`
        CREATE TABLE IF NOT EXISTS companies (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          name           TEXT NOT NULL UNIQUE,
          slug           TEXT NOT NULL UNIQUE,
          plan           TEXT NOT NULL DEFAULT 'starter'
                         CHECK(plan IN ('starter','pro','enterprise')),
          invite_code    TEXT UNIQUE,
          invite_enabled INTEGER NOT NULL DEFAULT 1,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          username   TEXT NOT NULL UNIQUE,
          password   TEXT NOT NULL,
          role       TEXT NOT NULL DEFAULT 'employee'
                     CHECK(role IN ('admin','pm','employee')),
          company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      database.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          description TEXT DEFAULT '',
          status      TEXT NOT NULL DEFAULT 'todo'
                      CHECK(status IN ('todo','doing','done')),
          priority    TEXT NOT NULL DEFAULT 'medium'
                      CHECK(priority IN ('low','medium','high')),
          deadline    DATE,
          assigned_to INTEGER,
          created_by  INTEGER NOT NULL,
          company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE CASCADE
        )
      `, async (err) => {
        if (err) return reject(err);
        try {
          const adminUser = process.env.ADMIN_USERNAME || 'admin';
          const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
          const existing = await get('SELECT id FROM users WHERE role = ?', ['admin']);
          if (!existing) {
            const hashed = await bcrypt.hash(adminPass, 10);
            await run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [adminUser, hashed, 'admin']);
            console.log(`👤 Администратор создан → логин: ${adminUser} / пароль: ${adminPass}`);
          }
          resolve();
        } catch (e) { reject(e); }
      });
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { initDb, run, get, all, generateInviteCode };