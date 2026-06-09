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
  const labels = { todo: 'Запланировано', doing: 'В работе', done: 'Выполнено' };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function priorityBadge(priority) {
  const icons   = { low: '▽', medium: '◇', high: '△' };
  const labels  = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
  return `<span class="badge badge-${priority}">${icons[priority] || ''} ${labels[priority] || priority}</span>`;
}

function roleBadge(role) {
  const cfg = {
    admin:    { icon: '⚡', label: 'Админ' },
    pm:       { icon: '👑', label: 'ПМ' },
    employee: { icon: '👤', label: 'Сотрудник' }
  };
  const r = cfg[role] || cfg.employee;
  return `<span class="badge badge-${role}">${r.icon} ${r.label}</span>`;
}

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
  const fmt = new Date(deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  if (ds === 'overdue') return `<span class="badge badge-overdue">🔴 Просрочено · ${fmt}</span>`;
  if (ds === 'soon')    return `<span class="badge badge-soon">🟡 Скоро срок · ${fmt}</span>`;
  return `<span class="badge badge-deadline">📅 ${fmt}</span>`;
}

// Таймер обратного отсчёта до дедлайна
function timerHtml(deadline, status) {
  if (!deadline || status === 'done') {
    if (status === 'done') return `<span class="task-timer timer-done">✓ Готово</span>`;
    return '';
  }
  const now      = new Date();
  const due      = new Date(deadline + 'T23:59:59');
  const diffMs   = due - now;
  const ds       = deadlineStatus(deadline, status);

  if (diffMs < 0) {
    const overDays = Math.ceil(Math.abs(diffMs) / 86400000);
    return `<span class="task-timer timer-overdue">⚠ Просрочено ${overDays}д</span>`;
  }

  const days  = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  const mins  = Math.floor((diffMs % 3600000) / 60000);

  let label;
  if (days > 0)       label = `${days}д ${hours}ч`;
  else if (hours > 0) label = `${hours}ч ${mins}м`;
  else                label = `${mins}м`;

  const cls = ds === 'soon' ? 'timer-soon' : '';
  return `<span class="task-timer ${cls}">⏱ ${label}</span>`;
}

// Чип исполнителя
function assigneeChip(task, currentUser, canTake = false) {
  if (task.assigned_username) {
    const isMe = currentUser && task.assigned_to === currentUser.userId;
    const name = isMe ? `${task.assigned_username} (я)` : task.assigned_username;
    const initials = task.assigned_username.slice(0,2).toUpperCase();
    return `<span class="task-assignee-chip">
      <span class="avatar" style="width:18px;height:18px;font-size:8px">${initials}</span>
      ${esc(name)}
    </span>`;
  }
  if (canTake) {
    return `<span class="task-unassigned" onclick="takeTask(${task.id},event)">+ Взять задачу</span>`;
  }
  return `<span class="task-assignee-chip" style="color:var(--text3);border-style:dashed">Не назначено</span>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function logout() {
  await API.get('/api/logout');
  window.location.href = '/';
}