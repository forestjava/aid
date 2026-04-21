## Разработка сервиса-экспортера

### Шаг 1. Создать сервис-экспортер

Экспортер — это HTTP-сервис с единственным обязательным эндпоинтом.

#### Контракт: `POST /start`

Runner AID отправляет на экспортер запрос:

```json
{ "jobId": "uuid", "path": "путь/к/файлу/документации" }
```

Экспортер **немедленно** отвечает `202 Accepted` (`{ "received": true }`), а обработку запускает асинхронно (fire-and-forget).

#### Отчёт о прогрессе

По ходу выполнения экспортер сам отправляет POST-запросы на Runner:

```
POST {CALLBACK_BASE_URL}/api/jobs/{jobId}/progress
```

```json
{ "jobId": "uuid", "status": "processing", "message": "Описание шага" }
```

Жизненный цикл статусов: `started` → `processing` (N раз) → `completed` | `failed`.

Статусы `completed` и `failed` — терминальные: после них задача закрывается.

#### Получение данных документации

Содержимое файла, указанного в `path`, можно получить через API Runner:

```
GET {CALLBACK_BASE_URL}/api/parse/text?path={path}
```

#### Требования

- Немедленный ответ `202` — не блокировать `/start`.
- Каждая задача обязана завершиться `completed` или `failed`.
- `try/catch` вокруг основной логики — при ошибке отправить `failed`.
- Stateless — параллельные задачи не должны мешать друг другу.

#### Минимальный шаблон (Express + TypeScript)

```typescript
import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT;
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL;

async function sendProgress(jobId: string, status: string, message: string) {
  await fetch(`${CALLBACK_BASE_URL}/api/jobs/${jobId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, status, message }),
  });
}

async function processJob(jobId: string, path: string) {
  try {
    await sendProgress(jobId, 'started', 'Инициализация');
    // ... ваша логика генерации ...
    await sendProgress(jobId, 'completed', 'Готово');
  } catch (err) {
    await sendProgress(jobId, 'failed', (err as Error).message);
  }
}

app.post('/start', (req, res) => {
  const { jobId, path } = req.body;
  processJob(jobId, path);
  res.status(202).json({ received: true });
});

app.listen(PORT, () => console.log(`Exporter on port ${PORT}`));
```

#### Переменные окружения в данном примере

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3030` | Порт экспортера |
| `CALLBACK_BASE_URL` | `https://doc.greact.online` | Базовый URL Runner для callback'ов |

### Шаг 2. Зарегистрировать экспортер на бэкенде

Файл `server/src/exporters/exporters.service.ts`, метод `onModuleInit()` — добавить вызов `this.register(...)`:

```typescript
this.register({
  exporterId: 'my-super-exporter',       // уникальный ID
  name: 'My Super Exporter',             // имя для логов и UI
  baseUrl: 'http://aid-runner-my-super-exporter:3030', // адрес внутри Docker-сети
  startPath: '/start',                   // путь для POST-запроса
});
```

### Шаг 3. Добавить кнопку на фронтенде

Файл `client/src/lib/export-config.ts` — добавить элемент в нужный раздел `exportMenuConfig`:

```typescript
{
  id: 'my-super-exporter',
  label: 'Мой генератор',
  action: (path) => startExporterJob('my-super-exporter', path),
},
```

Значение первого аргумента `startExporterJob` должно совпадать с `exporterId` из шага 2.

---

**Примеры существующих экспортеров:**
- `runner/node` — демонстрационный (пустой) экспортер
- `runner/crud-api-exporter` — экспортер, генерирующий описание CRUD API через LLM

## Agentic Mode (since 2026-04-14)

runner-prisma, runner-nestjs, and runner-react-admin now run in agentic mode:

- Each runner receives `workspacePath` in its start request.
- The workspace is a subdirectory of `/workspace`, shared between all runners via a Docker volume, and is pre-populated by the orchestrator with a `git clone` of the project repo (which already contains static templates).
- The runner does not return generated files in the job completion payload. It calls `runAgenticLoop` from `@aid/runner-shared`, which invokes the LLM in a multi-turn conversation with `list_files`, `read_file`, `write_file` tools against the workspace.
- After Phase 2, the orchestrator runs `git add . && git commit && git push` against the workspace.
- Legacy exporters (crud-api, demo, contract) continue to work with the old `{jobId, path}` payload — the new `workspacePath` and `projectName` fields are optional on the shared payload type.

