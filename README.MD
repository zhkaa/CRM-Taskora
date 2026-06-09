# • Taskora

**Taskora** — система управления задачами для команд с ролевым доступом.

![Вход](screenshots/login.png)

## Стек

- **Backend:** Node.js, Express, SQLite
- **Frontend:** Vanilla JS, HTML/CSS
- **Шрифты:** Unbounded + Nunito
- **Auth:** express-session + bcryptjs

## Роли

| Роль | Возможности |
|------|------------|
| 👤 Сотрудник | Видит свои задачи, берёт неназначенные, меняет статус |
| 👑 ПМ | Создаёт задачи, назначает на сотрудников, видит канбан команды |
| ⚡ Админ | Полное управление компаниями и пользователями |

## Скриншоты

### Панель задач
![Дашборд](screenshots/dashboard.png)

### Создание задачи
![Создание задачи](screenshots/create-task.png)

### Панель администратора
![Админ](screenshots/admin.png)

## Запуск

```bash
# Установить зависимости
npm install

# Создать .env файл
cp .env.example .env

# Запустить
npm run dev
```

Сервер запустится на `http://localhost:3000`

## .env