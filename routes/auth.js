const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../models/db');
const { generateInviteCode } = require('../models/db');

// POST /api/register-company — регистрация компании + PM аккаунт
router.post('/register-company', async (req, res) => {
  try {
    const { company_name, plan, username, password } = req.body;

    if (!company_name?.trim()) return res.status(400).json({ error: 'Company name required.' });
    if (!username?.trim())     return res.status(400).json({ error: 'Username required.' });
    if (!password)             return res.status(400).json({ error: 'Password required.' });
    if (username.length < 3)  return res.status(400).json({ error: 'Username min 3 characters.' });
    if (password.length < 6)  return res.status(400).json({ error: 'Password min 6 characters.' });

    const existingComp = await db.get('SELECT id FROM companies WHERE name=?', [company_name.trim()]);
    if (existingComp) return res.status(409).json({ error: 'Company name already taken.' });

    const existingUser = await db.get('SELECT id FROM users WHERE username=?', [username.trim()]);
    if (existingUser) return res.status(409).json({ error: 'Username already taken.' });

    const validPlans = ['starter','pro','enterprise'];
    const slug = company_name.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');

    // Генерируем уникальный invite-код
    let invite_code;
    let attempts = 0;
    do {
      invite_code = generateInviteCode(company_name);
      const exists = await db.get('SELECT id FROM companies WHERE invite_code=?', [invite_code]);
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    // Создаём компанию
    const compResult = await db.run(
      'INSERT INTO companies (name, slug, plan, invite_code) VALUES (?,?,?,?)',
      [company_name.trim(), slug, validPlans.includes(plan) ? plan : 'starter', invite_code]
    );

    // Создаём PM аккаунт
    const hashed = await bcrypt.hash(password, 10);
    const userResult = await db.run(
      'INSERT INTO users (username, password, role, company_id) VALUES (?,?,?,?)',
      [username.trim(), hashed, 'pm', compResult.lastID]
    );

    req.session.userId    = userResult.lastID;
    req.session.username  = username.trim();
    req.session.role      = 'pm';
    req.session.companyId = compResult.lastID;

    res.status(201).json({
      message:      'Company registered!',
      username:     username.trim(),
      role:         'pm',
      companyId:    compResult.lastID,
      companyName:  company_name.trim(),
      invite_code
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/register-employee — регистрация сотрудника по invite-коду
router.post('/register-employee', async (req, res) => {
  try {
    const { username, password, invite_code } = req.body;

    if (!username?.trim())    return res.status(400).json({ error: 'Username required.' });
    if (!password)            return res.status(400).json({ error: 'Password required.' });
    if (!invite_code?.trim()) return res.status(400).json({ error: 'Invite code required.' });
    if (username.length < 3)  return res.status(400).json({ error: 'Username min 3 characters.' });
    if (password.length < 6)  return res.status(400).json({ error: 'Password min 6 characters.' });

    // Проверяем invite-код
    const company = await db.get(
      'SELECT * FROM companies WHERE invite_code=? AND invite_enabled=1',
      [invite_code.trim().toUpperCase()]
    );
    if (!company) return res.status(404).json({ error: 'Invalid or disabled invite code.' });

    const existingUser = await db.get('SELECT id FROM users WHERE username=?', [username.trim()]);
    if (existingUser) return res.status(409).json({ error: 'Username already taken.' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password, role, company_id) VALUES (?,?,?,?)',
      [username.trim(), hashed, 'employee', company.id]
    );

    req.session.userId    = result.lastID;
    req.session.username  = username.trim();
    req.session.role      = 'employee';
    req.session.companyId = company.id;

    res.status(201).json({
      message:     'Account created!',
      username:    username.trim(),
      role:        'employee',
      companyId:   company.id,
      companyName: company.name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/invite/:code — проверить invite-код (для превью компании)
router.get('/invite/:code', async (req, res) => {
  try {
    const company = await db.get(
      'SELECT id, name, plan FROM companies WHERE invite_code=? AND invite_enabled=1',
      [req.params.code.toUpperCase()]
    );
    if (!company) return res.status(404).json({ error: 'Invalid or disabled invite code.' });
    res.json({ company });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const user = await db.get('SELECT * FROM users WHERE username=?', [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    req.session.userId    = user.id;
    req.session.username  = user.username;
    req.session.role      = user.role;
    req.session.companyId = user.company_id || null;

    res.json({
      message:   'Logged in.',
      username:  user.username,
      role:      user.role,
      companyId: user.company_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out.' });
  });
});

// GET /api/me
router.get('/me', (req, res) => {
  if (req.session?.userId)
    return res.json({
      userId:    req.session.userId,
      username:  req.session.username,
      role:      req.session.role,
      companyId: req.session.companyId || null
    });
  res.status(401).json({ error: 'Not authenticated.' });
});

module.exports = router;