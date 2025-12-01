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

