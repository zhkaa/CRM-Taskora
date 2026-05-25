const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const TASK_SELECT = `
  SELECT t.*,
         u1.username AS assigned_username,
         u1.role     AS assigned_role,
         u2.username AS created_username,
         c.name      AS company_name
  FROM tasks t
  JOIN users u1 ON t.assigned_to = u1.id
  JOIN users u2 ON t.created_by  = u2.id
  LEFT JOIN companies c ON t.company_id = c.id
`;

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const { status, priority, search, assignee, overdue } = req.query;
    const role      = req.session.role;
    const userId    = req.session.userId;
    const companyId = req.session.companyId;

    let sql    = TASK_SELECT + ' WHERE 1=1';
    const params = [];

    if (role === 'employee') {
      sql += ' AND t.assigned_to=?'; params.push(userId);
    } else if (role === 'pm') {
      sql += ' AND t.company_id=?'; params.push(companyId);
    }
    // admin видит всё

    if (assignee && !isNaN(assignee) && role !== 'employee') {
      sql += ' AND t.assigned_to=?'; params.push(parseInt(assignee));
    }
    if (status && ['todo','doing','done'].includes(status)) {
      sql += ' AND t.status=?'; params.push(status);
    }
    if (priority && ['low','medium','high'].includes(priority)) {
      sql += ' AND t.priority=?'; params.push(priority);
    }
    if (search) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (overdue === '1') {
      sql += ` AND t.deadline IS NOT NULL AND t.deadline < date('now') AND t.status!='done'`;
    }
    sql += ' ORDER BY t.deadline ASC, t.created_at DESC';

    const tasks = await db.all(sql, params);
    res.json(tasks);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority, deadline, assigned_to } = req.body;
    const userId    = req.session.userId;
    const role      = req.session.role;
    const companyId = req.session.companyId;

    if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });

    let assignTo  = userId;
    let taskCompany = companyId;

    if ((role === 'pm' || role === 'admin') && assigned_to) {
      const assignee = await db.get('SELECT id, company_id FROM users WHERE id=?', [assigned_to]);
      if (!assignee) return res.status(404).json({ error: 'Assignee not found.' });
      assignTo    = assigned_to;
      taskCompany = assignee.company_id;
    }

    const validS = ['todo','doing','done'];
    const validP = ['low','medium','high'];

    const result = await db.run(
      `INSERT INTO tasks (title,description,status,priority,deadline,assigned_to,created_by,company_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [title.trim(), description||'',
       validS.includes(status)?status:'todo',
       validP.includes(priority)?priority:'medium',
       deadline||null, assignTo, userId, taskCompany||null]
    );
    const task = await db.get(TASK_SELECT + ' WHERE t.id=?', [result.lastID]);
    res.status(201).json(task);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const role      = req.session.role;
    const userId    = req.session.userId;
    const companyId = req.session.companyId;

    let sql    = TASK_SELECT + ' WHERE t.id=?';
    const params = [req.params.id];

    if (role === 'employee') { sql += ' AND t.assigned_to=?'; params.push(userId); }
    else if (role === 'pm')  { sql += ' AND t.company_id=?';  params.push(companyId); }

    const task = await db.get(sql, params);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(task);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  try {
    const role      = req.session.role;
    const userId    = req.session.userId;
    const companyId = req.session.companyId;

    const task = await db.get('SELECT * FROM tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    if (role === 'employee') {
      if (task.assigned_to !== userId) return res.status(403).json({ error: 'Access denied.' });
      const { status } = req.body;
      if (!['todo','doing','done'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
      await db.run('UPDATE tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [status, req.params.id]);
    } else {
      if (role === 'pm' && task.company_id !== companyId) return res.status(403).json({ error: 'Access denied.' });
      const { title, description, status, priority, deadline, assigned_to } = req.body;
      const validS = ['todo','doing','done'];
      const validP = ['low','medium','high'];
      await db.run(
        `UPDATE tasks SET title=?,description=?,status=?,priority=?,deadline=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [title?.trim()||task.title, description!==undefined?description:task.description,
         validS.includes(status)?status:task.status, validP.includes(priority)?priority:task.priority,
         deadline!==undefined?(deadline||null):task.deadline, assigned_to||task.assigned_to, req.params.id]
      );
    }
    const updated = await db.get(TASK_SELECT + ' WHERE t.id=?', [req.params.id]);
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const role      = req.session.role;
    const userId    = req.session.userId;
    const companyId = req.session.companyId;

    if (role === 'employee') return res.status(403).json({ error: 'Access denied.' });

    let sql    = 'DELETE FROM tasks WHERE id=?';
    const params = [req.params.id];
    if (role === 'pm') { sql += ' AND company_id=?'; params.push(companyId); }

    const result = await db.run(sql, params);
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found.' });
    res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;