const API = {
  async request(method, url, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  },
  get:    (url)       => API.request('GET',    url),
  post:   (url, body) => API.request('POST',   url, body),
  put:    (url, body) => API.request('PUT',    url, body),
  delete: (url)       => API.request('DELETE', url),
};

async function requireAuth() {
  const res = await API.get('/api/me');
  if (!res.ok) { window.location.href = '/login'; return null; }
  return res.data;
}

async function redirectIfAuth() {
  const res = await API.get('/api/me');
  if (res.ok) {
    window.location.href = res.data.role === 'admin' ? '/admin' : '/dashboard';
  }
}

function showToast(message, type = 'success') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-dot"></span><span>${message}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = 'all 0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function statusBadge(status) {
  const labels = { todo: 'To Do', doing: 'In Progress', done: 'Done' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function priorityBadge(priority) {
  const icons = { low: '▽', medium: '◇', high: '△' };
  return `<span class="badge badge-${priority}">${icons[priority] || ''} ${priority}</span>`;
}

function roleBadge(role) {
  const cfg = {
    admin:    { icon: '⚡', label: 'Admin' },
    pm:       { icon: '👑', label: 'PM' },
    employee: { icon: '👤', label: 'Employee' }
  };
  const r = cfg[role] || cfg.employee;
  return `<span class="badge badge-${role}">${r.icon} ${r.label}</span>`;
}

// Deadline helpers
function deadlineStatus(deadline, status) {
  if (!deadline || status === 'done') return null;
  const today    = new Date(); today.setHours(0,0,0,0);
  const due      = new Date(deadline);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0)  return 'overdue';
  if (diffDays <= 2) return 'soon';
  return 'ok';
}

function deadlineBadge(deadline, status) {
  if (!deadline) return '';
  const ds  = deadlineStatus(deadline, status);
  const fmt = new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (ds === 'overdue') return `<span class="badge badge-overdue">🔴 Overdue · ${fmt}</span>`;
  if (ds === 'soon')    return `<span class="badge badge-soon">🟡 Due soon · ${fmt}</span>`;
  return `<span class="badge badge-deadline">📅 ${fmt}</span>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function esc(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function logout() {
  await API.get('/api/logout');
  window.location.href = '/';
}