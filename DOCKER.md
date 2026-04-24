# Docker Setup

## Структура

Приложение состоит из трех Docker контейнеров:
- **backend** - NestJS API (порт 3000)
- **frontend** - React + Vite, сервится через nginx (порт 80)
- **proxy** - Nginx reverse proxy (порт 80 наружу)

## Первый запуск

Создайте директорию для данных:
```bash
mkdir -p data
```

Скопируйте примеры данных (опционально):
```bash
cp -r data.example/* data/
```

## Запуск

### Сборка и запуск всех сервисов:
```bash
docker-compose up --build
```

### Запуск в фоновом режиме:
```bash
docker-compose up -d --build
```

### Остановка:
```bash
docker-compose down
```

### Остановка с удалением volumes:
```bash
docker-compose down -v
```

## Доступ к приложению

После запуска приложение доступно по адресу:
- Frontend: http://localhost
- API: http://localhost/api

## Данные

Данные backend хранятся в директории `./data` на хосте и монтируются в контейнер в `/data`.

## Переменные окружения

Backend использует переменную окружения `FS_ROOT_PATH=/data` для указания пути к данным.

## Логи

Просмотр логов всех сервисов:
```bash
docker-compose logs -f
```

Просмотр логов конкретного сервиса:
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f proxy
```

## Пересборка

Пересборка конкретного сервиса:
```bash
docker-compose build backend
docker-compose build frontend
```

## Проверка статуса

```bash
docker-compose ps
```

## Деплой в Portainer: контуры dev/prod

`docker-compose.portainer.yml` рассчитан на параллельный деплой двух stack'ов из одного git-репозитория. Внутри стека сервисы сидят в приватной compose-сети `internal`; в общую external-сеть `proxy` выходит только контейнер `aid-proxy${ENV_SUFFIX}` — он и виден внешнему reverse-proxy.

| Переменная stack'а | prod | dev |
|--------------------|------|-----|
| `ENV_SUFFIX` | (пусто) | `-dev` |
| `EXPORTER_DEMO_URL` | `http://aid-runner-demo:3003` | `http://aid-runner-demo-dev:3003` |
| `EXPORTER_CRUD_API_URL` | `http://aid-runner-crud-api-exporter:3003` | `http://aid-runner-crud-api-exporter-dev:3003` |
| `EXPORTER_CONTRACT_URL` | `http://contract-craft-dev-service:8080` | `http://contract-craft-dev-service:8080` |
| `EXPORTER_PRISMA_URL` | `http://aid-runner-prisma:3004` | `http://aid-runner-prisma-dev:3004` |
| `EXPORTER_NESTJS_URL` | `http://aid-runner-nestjs:3005` | `http://aid-runner-nestjs-dev:3005` |
| `EXPORTER_REACT_ADMIN_URL` | `http://aid-runner-react-admin:3006` | `http://aid-runner-react-admin-dev:3006` |

Значения задаются в UI Portainer → Stack → Environment variables. В репозиторий `.env` не коммитится (см. `.env.example` как ориентир).

Stack'и:
- **prod** — git ref `master`, переменные из колонки prod.
- **dev** — git ref `dev` (создаётся от `master` и отслеживает его), переменные из колонки dev.

Named volumes `backend_data` (данные backend) и `workspace` (шина между backend и runner'ами) автоматически префиксуются project-name'ом Portainer-стека (`aid_backend_data` vs `aid-dev_backend_data`), поэтому никаких ручных правок для изоляции данных не требуется.
