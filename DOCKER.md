# Docker Setup

## Структура

Два compose-файла (канонический Docker-паттерн):

- **`docker-compose.yml`** — production-safe база. Все сервисы (`backend`, `frontend`, runner-\*, `proxy`). У `proxy` нет `ports:` — наружу хоста ничего не публикуется, маршрутизация идёт через external-сеть `proxy`. Этот файл деплоится в Portainer как есть.
- **`docker-compose.override.yml`** — локальный dev-overlay. Содержит ровно одно изменение: добавляет `ports: ["${PROXY_HOST_PORT:-8080}:80"]` к `proxy`, чтобы UI был доступен с хоста.

`docker compose up` без флагов автоматически мёржит оба файла. Portainer запускает Compose с явным `-f docker-compose.yml` и `override.yml` подмешать не успевает — поведение в проде остаётся чистым.

Сервисы:

- **backend** — NestJS API (`expose 3000`)
- **frontend** — React + Vite, отданный через nginx (`expose 80`)
- **runner-\*** — генераторы (demo, crud-api-exporter, prisma, nestjs, react-admin) на портах 3003–3006
- **proxy** — nginx reverse proxy (роутит `/` на frontend, `/api` на backend)

## Первый запуск (локально)

Сеть `proxy` объявлена как `external: true` (общая с другими стеками в проде). Создайте её один раз:
```bash
docker network create proxy
```

## Запуск (локально)

```bash
docker compose up --build           # передний план
docker compose up -d --build        # фоном
docker compose down                 # без удаления volumes
docker compose down -v              # с удалением workspace и backend_data
```

## Доступ к приложению (локально)

- UI: http://localhost:8080
- API: http://localhost:8080/api

Хост-порт меняется переменной `PROXY_HOST_PORT` (например, `PROXY_HOST_PORT=3001 docker compose up`).

## Данные

Backend хранит файлы в named volume `backend_data` (`/data` внутри контейнера). Workspace runner'ов — `workspace`. Оба автоматически изолируются project-name'ом стека (локально — `aid_*`, в Portainer — `aid_*` / `aid-dev_*`).

## Логи

```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f proxy
```

## Пересборка

```bash
docker compose build backend
docker compose build frontend
```

## Проверка статуса

```bash
docker compose ps
```

## Деплой в Portainer: контуры dev/prod

В Portainer оба stack'а (prod и dev) деплоятся из одного и того же `docker-compose.yml`. Override-файл не подхватывается, потому что Portainer указывает compose-файл явно через `-f`. Внешний reverse-proxy в общей сети `proxy` маршрутизирует трафик на контейнер `aid-proxy${ENV_SUFFIX}` по доменам.

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

Named volumes `backend_data` и `workspace` автоматически префиксуются project-name'ом Portainer-стека (`aid_backend_data` vs `aid-dev_backend_data`), поэтому изоляция данных между контурами получается из коробки.
