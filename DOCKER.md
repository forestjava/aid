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

`docker-compose.portainer.yml` рассчитан на параллельный деплой двух stack'ов из одного git-репозитория:

| Переменная stack'а | prod | dev |
|--------------------|------|-----|
| `ENV_SUFFIX` | (пусто) | `-dev` |
| `DATA_HOST_PATH` | `/data/aid` | `/data/aid-dev` |
| `EXPORTER_DEMO_URL` | `http://aid-runner-demo:3003` | `http://aid-runner-demo-dev:3003` |
| `EXPORTER_CRUD_API_URL` | `http://aid-runner-crud-api-exporter:3003` | `http://aid-runner-crud-api-exporter-dev:3003` |
| `EXPORTER_CONTRACT_URL` | `http://contract-craft-dev-service:8080` | `http://contract-craft-dev-service:8080` |

Значения задаются в UI Portainer → Stack → Environment variables. В репозиторий `.env` не коммитится (см. `.env.example` как ориентир).

Stack'и:
- **prod** — git ref `master`, переменные из колонки prod.
- **dev** — git ref `dev` (создаётся от `master` и отслеживает его), переменные из колонки dev.

Оба stack'а живут в одной external-сети `proxy` и публикуются во внешний reverse-proxy через имена контейнеров (`aid-frontend${ENV_SUFFIX}:80`, `aid-backend${ENV_SUFFIX}:3000`). Порты на хост не пробрасываются.
