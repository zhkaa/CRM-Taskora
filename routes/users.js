const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../models/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/users
router.get('/', requireAuth, async (req, res) => {
  try {
    const role      = req.session.role;
    const companyId = req.session.companyId;
    if (!['admin','pm'].includes(role)) return res.status(403).json({ error: 'Access denied.' });

    let sql, params;
    if (role === 'admin') {
      // admin видит всех
      sql    = `SELECT id, username, role, company_id, created_at,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id) AS total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='todo')  AS todo_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='doing') AS doing_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='done')  AS done_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND deadline < date('now') AND status!='done') AS overdue_count
        FROM users ORDER BY role ASC, username ASC`;
      params = [];
    } else {
      // pm видит только свою компанию
      sql    = `SELECT id, username, role, company_id, created_at,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id) AS total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='todo')  AS todo_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='doing') AS doing_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='done')  AS done_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND deadline < date('now') AND status!='done') AS overdue_count
        FROM users WHERE company_id=? ORDER BY role ASC, username ASC`;
      params = [companyId];
    }
    const users = await db.all(sql, params);
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, company_id } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
    if (!['admin','pm','employee'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });

    const existing = await db.get('SELECT id FROM users WHERE username=?', [username]);
    if (existing) return res.status(409).json({ error: 'Username already taken.' });

    // Если роль не admin — company_id обязателен
    if (role !== 'admin' && !company_id) return res.status(400).json({ error: 'Company required for non-admin users.' });
    if (company_id) {
      const comp = await db.get('SELECT id FROM companies WHERE id=?', [company_id]);
      if (!comp) return res.status(404).json({ error: 'Company not found.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password, role, company_id) VALUES (?,?,?,?)',
      [username, hashed, role, role !== 'admin' ? company_id : null]
    );
    const user = await db.get('SELECT id, username, role, company_id, created_at FROM users WHERE id=?', [result.lastID]);
    res.status(201).json(user);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role, password, username, company_id } = req.body;
    const user = await db.get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (parseInt(req.params.id) === req.session.userId)
      return res.status(400).json({ error: "Can't modify your own account here." });

    const newRole     = ['admin','pm','employee'].includes(role) ? role : user.role;
    const newUsername = username?.trim() || user.username;
    const newCompany  = company_id !== undefined ? (company_id || null) : user.company_id;
    let   newPassword = user.password;
    if (password && password.length >= 6) newPassword = await bcrypt.hash(password, 10);

    await db.run(
      'UPDATE users SET username=?, role=?, password=?, company_id=? WHERE id=?',
      [newUsername, newRole, newPassword, newRole !== 'admin' ? newCompany : null, req.params.id]
    );
    const updated = await db.get('SELECT id, username, role, company_id, created_at FROM users WHERE id=?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.session.userId)
      return res.status(400).json({ error: "Can't delete yourself." });
    const result = await db.run('DELETE FROM users WHERE id=?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/users/stats
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalCompanies = await db.get('SELECT COUNT(*) as cnt FROM companies');
    const totalUsers     = await db.get("SELECT COUNT(*) as cnt FROM users WHERE role != 'admin'");
    const totalTasks     = await db.get('SELECT COUNT(*) as cnt FROM tasks');
    const doneTasks      = await db.get("SELECT COUNT(*) as cnt FROM tasks WHERE status='done'");
    const doingTasks     = await db.get("SELECT COUNT(*) as cnt FROM tasks WHERE status='doing'");
    const todoTasks      = await db.get("SELECT COUNT(*) as cnt FROM tasks WHERE status='todo'");
    const overdueTasks   = await db.get("SELECT COUNT(*) as cnt FROM tasks WHERE deadline < date('now') AND status!='done'");
    const byPriority     = await db.all("SELECT priority, COUNT(*) as cnt FROM tasks GROUP BY priority");
    const topCompanies   = await db.all(`
      SELECT c.name, c.plan,
        COUNT(DISTINCT u.id) as members,
        COUNT(t.id)          as total_tasks,
        SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_tasks
      FROM companies c
      LEFT JOIN users u ON u.company_id = c.id
      LEFT JOIN tasks t ON t.company_id = c.id
      GROUP BY c.id ORDER BY total_tasks DESC LIMIT 5
    `);
    res.json({ totalCompanies: totalCompanies.cnt, totalUsers: totalUsers.cnt,
      totalTasks: totalTasks.cnt, doneTasks: doneTasks.cnt, doingTasks: doingTasks.cnt,
      todoTasks: todoTasks.cnt, overdueTasks: overdueTasks.cnt, byPriority, topCompanies });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;