# Разработка сервиса-экспортера

Экспортер — это HTTP-сервис, который получает задачу от Runner, выполняет ее асинхронно и отчитывается о прогрессе через callback-запросы.

## Контракт

### Прием задачи: `POST /start`

Runner отправляет запрос на запуск задачи.

**Request body:**

```json
{
  "jobId": "uuid",
  "path": "путь/к/файлу/документации"
}
```

| Поле    | Тип      | Описание                                   |
| ------- | -------- | ------------------------------------------ |
| `jobId` | `string` | Уникальный идентификатор задачи (UUID)     |
| `path`  | `string` | Путь к файлу документации в рабочей области |

**Response:** `202 Accepted` — немедленно, до начала обработки.

```json
{ "received": true }
```

Обработка задачи выполняется асинхронно (fire-and-forget).

### Отчет о прогрессе: `POST /api/jobs/{jobId}/progress`

По ходу выполнения экспортер отправляет POST-запросы на Runner.

**URL:** `{CALLBACK_BASE_URL}/api/jobs/{jobId}/progress` (по умолчанию `http://localhost:3000`).

**Request body:**

```json
{
  "jobId": "uuid",
  "status": "processing",
  "message": "Текстовое описание текущего шага"
}
```

| Поле      | Тип      | Описание                                                  |
| --------- | -------- | --------------------------------------------------------- |
| `jobId`   | `string` | Идентификатор задачи (тот же, что получен в `/start`)     |
| `status`  | `string` | Одно из: `started`, `processing`, `completed`, `failed`   |
| `message` | `string` | Человекочитаемое описание; отображается пользователю в UI |

### Жизненный цикл статусов

```
started → processing → ... → processing → completed
                                         → failed
```

| Статус       | Когда отправлять                          | Завершает задачу |
| ------------ | ----------------------------------------- | ---------------- |
| `started`    | Первый сигнал, инициализация              | Нет              |
| `processing` | Промежуточные шаги (можно несколько раз)  | Нет              |
| `completed`  | Успешное завершение                       | **Да**           |
| `failed`     | Ошибка на любом этапе                     | **Да**           |

После `completed` или `failed` задача считается завершенной — SSE-поток закрывается, дальнейшие отчеты игнорируются.

## Требования к реализации

1. **Немедленный ответ на `/start`.** Вернуть `202` до начала обработки, не блокировать.
2. **Обязательно отправить терминальный статус.** Каждая задача должна завершиться `completed` или `failed`.
3. **Обработка ошибок.** Оберните основную логику в `try/catch` — при любой ошибке отправьте `failed` с описанием.
4. **Stateless.** Экспортер не должен хранить состояние между запросами — параллельные задачи не должны мешать друг другу.
5. **Идемпотентность callback'ов.** Runner игнорирует дублирующие отчеты с тем же `status` + `message`.

## Минимальный шаблон (Express + TypeScript)

```typescript
import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3001;
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL ?? 'http://localhost:3000';

interface StartRequest {
  jobId: string;
  path: string;
}

async function sendProgress(jobId: string, status: string, message: string): Promise<void> {
  await fetch(`${CALLBACK_BASE_URL}/api/jobs/${jobId}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, status, message }),
  });
}

async function processJob(jobId: string, path: string): Promise<void> {
  try {
    await sendProgress(jobId, 'started', 'Инициализация');

    // ... ваша логика ...

    await sendProgress(jobId, 'completed', 'Готово');
  } catch (err) {
    await sendProgress(jobId, 'failed', (err as Error).message);
  }
}

app.post('/start', (req, res) => {
  const { jobId, path } = req.body as StartRequest;
  processJob(jobId, path);
  res.status(202).json({ received: true });
});

app.listen(PORT, () => console.log(`Exporter on port ${PORT}`));
```

## Переменные окружения

| Переменная          | По умолчанию            | Описание                             |
| ------------------- | ----------------------- | ------------------------------------ |
| `PORT`              | `3001`                  | Порт, на котором слушает экспортер   |
| `CALLBACK_BASE_URL` | `http://localhost:3000`  | Базовый URL Runner для callback'ов   |

## Данные документации

Для получения содержимого файла документации используйте API Runner:

```
GET {CALLBACK_BASE_URL}/api/parse/text?path={path}
```

Ответ: `{ "path": "...", "content": "текст файла" }`.

## Регистрация экспортера

После создания сервиса его необходимо зарегистрировать в реестре Runner — файл `server/src/exporters/exporters.service.ts`, метод `onModuleInit()`:

```typescript
onModuleInit() {
  this.register({
    exporterId: 'my-exporter',    // уникальный идентификатор
    name: 'My Exporter',          // отображаемое имя
    baseUrl: 'http://localhost:3002', // адрес сервиса-экспортера
    startPath: '/start',          // путь для запуска задачи
  });
}
```

Поля конфигурации `ExporterConfig`:

| Поле         | Тип      | Описание                                |
| ------------ | -------- | --------------------------------------- |
| `exporterId` | `string` | Уникальный идентификатор (используется в API: `POST /api/jobs` с `exporterId`) |
| `name`       | `string` | Название для логов и UI                 |
| `baseUrl`    | `string` | Базовый URL сервиса-экспортера          |
| `startPath`  | `string` | Путь для POST-запроса на старт задачи   |
