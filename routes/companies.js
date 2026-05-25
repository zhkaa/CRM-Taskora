const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { generateInviteCode } = require('../models/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/companies — admin видит все, pm видит свою
router.get('/', requireAuth, async (req, res) => {
  try {
    const { role, companyId } = req.session;
    if (!['admin','pm'].includes(role)) return res.status(403).json({ error: 'Access denied.' });

    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM users WHERE company_id=c.id)                                               AS member_count,
        (SELECT COUNT(*) FROM tasks WHERE company_id=c.id)                                               AS task_count,
        (SELECT COUNT(*) FROM tasks WHERE company_id=c.id AND status='done')                             AS done_count,
        (SELECT COUNT(*) FROM tasks WHERE company_id=c.id AND deadline < date('now') AND status!='done') AS overdue_count
      FROM companies c
    `;
    const params = [];
    if (role === 'pm') { sql += ' WHERE c.id=?'; params.push(companyId); }
    else sql += ' ORDER BY c.created_at DESC';

    const companies = await db.all(sql, params);
    res.json(companies);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/companies — только admin
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, plan } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Company name required.' });
    const slug = name.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const existing = await db.get('SELECT id FROM companies WHERE name=? OR slug=?', [name.trim(), slug]);
    if (existing) return res.status(409).json({ error: 'Company name already taken.' });

    let invite_code;
    let attempts = 0;
    do {
      invite_code = generateInviteCode(name);
      const exists = await db.get('SELECT id FROM companies WHERE invite_code=?', [invite_code]);
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    const validPlans = ['starter','pro','enterprise'];
    const result = await db.run(
      'INSERT INTO companies (name, slug, plan, invite_code) VALUES (?,?,?,?)',
      [name.trim(), slug, validPlans.includes(plan) ? plan : 'starter', invite_code]
    );
    const company = await db.get('SELECT * FROM companies WHERE id=?', [result.lastID]);
    res.status(201).json(company);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/companies/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { role, companyId } = req.session;
    if (role !== 'admin' && !(role === 'pm' && companyId === parseInt(req.params.id)))
      return res.status(403).json({ error: 'Access denied.' });

    const { name, plan } = req.body;
    const company = await db.get('SELECT * FROM companies WHERE id=?', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const newName = name?.trim() || company.name;
    const newSlug = newName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const validPlans = ['starter','pro','enterprise'];
    const newPlan = validPlans.includes(plan) ? plan : company.plan;
    await db.run('UPDATE companies SET name=?, slug=?, plan=? WHERE id=?', [newName, newSlug, newPlan, req.params.id]);
    const updated = await db.get('SELECT * FROM companies WHERE id=?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/companies/:id — только admin
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM companies WHERE id=?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Company not found.' });
    res.json({ message: 'Company deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/companies/:id/users
router.get('/:id/users', requireAuth, async (req, res) => {
  try {
    const { role, companyId } = req.session;
    if (role !== 'admin' && !(role === 'pm' && companyId === parseInt(req.params.id)))
      return res.status(403).json({ error: 'Access denied.' });

    const users = await db.all(`
      SELECT id, username, role, created_at,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id) AS total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='todo')  AS todo_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='doing') AS doing_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND status='done')  AS done_count,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to=users.id AND deadline < date('now') AND status!='done') AS overdue_count
      FROM users WHERE company_id=? ORDER BY role ASC, username ASC
    `, [req.params.id]);
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/companies/:id/reset-invite — сброс invite-кода (admin или PM своей компании)
router.post('/:id/reset-invite', requireAuth, async (req, res) => {
  try {
    const { role, companyId } = req.session;
    if (role !== 'admin' && !(role === 'pm' && companyId === parseInt(req.params.id)))
      return res.status(403).json({ error: 'Access denied.' });

    const company = await db.get('SELECT * FROM companies WHERE id=?', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    let invite_code;
    let attempts = 0;
    do {
      invite_code = generateInviteCode(company.name);
      const exists = await db.get('SELECT id FROM companies WHERE invite_code=? AND id!=?', [invite_code, req.params.id]);
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    await db.run('UPDATE companies SET invite_code=? WHERE id=?', [invite_code, req.params.id]);
    res.json({ invite_code });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/companies/:id/toggle-invite — вкл/выкл invite (admin или PM)
router.post('/:id/toggle-invite', requireAuth, async (req, res) => {
  try {
    const { role, companyId } = req.session;
    if (role !== 'admin' && !(role === 'pm' && companyId === parseInt(req.params.id)))
      return res.status(403).json({ error: 'Access denied.' });

    const company = await db.get('SELECT * FROM companies WHERE id=?', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const newVal = company.invite_enabled ? 0 : 1;
    await db.run('UPDATE companies SET invite_enabled=? WHERE id=?', [newVal, req.params.id]);
    res.json({ invite_enabled: newVal });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;