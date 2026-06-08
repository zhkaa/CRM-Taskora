const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const { initDb } = require('./models/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'taskora-super-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api',           require('./routes/auth'));
app.use('/api/tasks',     require('./routes/tasks'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/companies', require('./routes/companies'));

app.get('/',                  (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login',             (_, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html')));
app.get('/register',          (_, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'register.html')));
app.get('/dashboard',         (_, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html')));
app.get('/create-task',       (_, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'create-task.html')));
app.get('/admin',             (_, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html')));

// 404
app.use((_, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'pages', '404.html')));

// 500
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).sendFile(path.join(__dirname, 'public', 'pages', '500.html'));
});

async function start() {
  await initDb();
  console.log('✅ Database ready');
  app.listen(PORT, () => console.log(`🚀 Taskora → http://localhost:${PORT}`));
}
start();
