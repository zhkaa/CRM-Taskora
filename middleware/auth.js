function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

module.exports = { requireAuth, requireAdmin };