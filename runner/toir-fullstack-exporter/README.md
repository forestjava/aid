# toir-fullstack-exporter

Долгоживущий AID-runner, который превращает один файл `*.api.dsl` в развёрнутое
публично доступное fullstack-приложение: NestJS + Prisma на бэке, React Admin
на фронте, защита через Keycloak, фронт за Nginx Proxy Manager, оркестрация
через Portainer.

Экспортер запускается из UI AID («Export → toir-fullstack» на файле
`.api.dsl`) и шлёт прогресс обратно в AID по HTTP. На успехе возвращает
публичный HTTPS URL, на ошибке — структурированный отчёт о падении.

---

## Что делает экспортер

Получив путь к `domain/*.api.dsl`, экспортер выполняет:

1. **Fetch DSL** — забирает содержимое DSL из workspace AID.
   → [`src/fetchSource.ts`](src/fetchSource.ts), вызов в
   [`src/orchestrator.ts:121`](src/orchestrator.ts)
2. **Contract freeze** — нормализует контракт (entities, enums, DTOs, endpoints).
   → [`src/generator/contractFreeze.ts`](src/generator/contractFreeze.ts), вызов
   в [`src/orchestrator.ts:125`](src/orchestrator.ts)
3. **Scaffold** — копирует фиксированный скелет (`package.json`, `tsconfig`,
   конфиги Vite/Nest).
   → [`src/generator/scaffold.ts`](src/generator/scaffold.ts), вызов в
   [`src/orchestrator.ts:134`](src/orchestrator.ts)
4. **Пять LLM-стадий** против замороженного контракта, каждая с одноразовым
   ремонтным проходом при провале валидатора:
   - **prisma** — `server/prisma/schema.prisma`
     → [`src/generator/stages/prismaStage.ts`](src/generator/stages/prismaStage.ts),
     запуск через `runLlmStage` в [`src/orchestrator.ts:151`](src/orchestrator.ts)
   - **nest-entities** — `server/src/modules/**`
     → [`src/generator/stages/nestEntityStage.ts`](src/generator/stages/nestEntityStage.ts),
     запуск в [`src/orchestrator.ts:152`](src/orchestrator.ts)
   - **react-entities** — `client/src/resources/**`
     → [`src/generator/stages/reactEntityStage.ts`](src/generator/stages/reactEntityStage.ts),
     запуск в [`src/orchestrator.ts:158`](src/orchestrator.ts)
   - **integration** — `app.module.ts`, `App.tsx`, `dataProvider.ts`
     → [`src/generator/stages/integrationStage.ts`](src/generator/stages/integrationStage.ts),
     запуск в [`src/orchestrator.ts:164`](src/orchestrator.ts)
   - **auth** — `server/src/auth/**`, `client/src/auth/**`
     → [`src/generator/stages/authStage.ts`](src/generator/stages/authStage.ts),
     запуск в [`src/orchestrator.ts:165`](src/orchestrator.ts)
5. **Post-processing** — детерминированно правит сгенерированный
   `docker-compose.yml`: проставляет `container_name` и внешнюю proxy-сеть.
   → [`src/generator/postProcess.ts`](src/generator/postProcess.ts), вызов в
   [`src/orchestrator.ts:169`](src/orchestrator.ts)
6. **Validation** — запускает структурный валидатор.
   → [`src/generator/validate.ts`](src/generator/validate.ts) (обёртка над
   [`context/tools/validate-generation.mjs`](context/tools/validate-generation.mjs)),
   вызов в [`src/orchestrator.ts:178`](src/orchestrator.ts)
7. **Gitea push** — пушит сгенерированный проект в свежий Gitea-репозиторий.
   → [`src/gitea/client.ts`](src/gitea/client.ts),
   [`src/gitea/push.ts`](src/gitea/push.ts), вызов в
   [`src/deploy/index.ts:38-45`](src/deploy/index.ts)
8. **Portainer stack** — создаёт стек из репозитория, ждёт пока контейнеры
   поднимутся.
   → [`src/portainer/stack.ts`](src/portainer/stack.ts), вызов в
   [`src/deploy/index.ts:48-60`](src/deploy/index.ts)
9. **Nginx Proxy Manager** — заводит proxy host на wildcard-сертификате.
   → [`src/npm/proxy.ts`](src/npm/proxy.ts), [`src/npm/client.ts`](src/npm/client.ts)
10. **Writeback** — пишет sidecar `*.deploy.md` рядом с исходным DSL.
    → [`src/writeback.ts`](src/writeback.ts), вызов в
    [`src/orchestrator.ts:62`](src/orchestrator.ts)

При любой ошибке [`rollback()`](src/deploy/rollback.ts) сносит всё, что успели
создать (NPM host → Portainer stack → Gitea repo), и только после этого AID
видит статус `failed`. Исходная ошибка передаётся в стрим AID **дословно** —
см. [`src/orchestrator.ts:66-102`](src/orchestrator.ts).

---

## Архитектура

```
        ┌──────────────┐    POST /start             ┌─────────────────────┐
        │    AID UI    │ ─────────────────────────▶ │  exporter (Express) │
        └──────────────┘                            │     src/index.ts    │
              ▲                                     └─────────┬───────────┘
              │ progress callbacks                            │ runJob()
              │ (POST {CALLBACK_BASE_URL}/...)                ▼
              │                                     ┌─────────────────────┐
              │                                     │   orchestrator.ts   │
              │                                     └─────────┬───────────┘
              │                          ┌──────────┬─────────┴─────────┬──────────┐
              │                          ▼          ▼                   ▼          ▼
              │                       fetch     contract-freeze     LLM stages  validator
              │                                                          │
              │                                                          ▼
              │                                                  /tmp/jobs/<jobId>
              │                                                          │
              │                          ┌───────────┬───────────────────┴───────────┐
              │                          ▼           ▼                               ▼
              │                       Gitea       Portainer                  Nginx Proxy Mgr
              │                       (push)      (stack from repo)          (proxy host)
              │                                                                      │
              └──────────────────────────────────────────────────────────────────────┘
                                            URL: https://gen-{date}-{hash}.greact.ru
```

Раннер **stateless**: каждый job получает свежий рабочий каталог
`/tmp/jobs/<jobId>` и новый slug `gen-{yyyymmdd}-{sha1(jobId)[:8]}` (см.
[`src/deploy/slug.ts`](src/deploy/slug.ts)). Внутри контейнера нет ни базы, ни
очереди, ни персистентного состояния.

### Прогресс-коллбэки в AID

Каждый этап шлёт строку прогресса через
[`sendProgress()`](src/progress.ts) — POST на `${CALLBACK_BASE_URL}/...`.
Именно эти строки видны в jobs-панели AID.

### Кто что пишет (write-zones)

Каждая LLM-стадия фильтрует свой вывод по разрешённым префиксам и **молча
дропает всё, что вне зоны** (с предупреждением в логи). Примеры:

- `authStage` — только `server/src/auth/` и `client/src/auth/`
  ([`stages/authStage.ts:13`](src/generator/stages/authStage.ts))
- `nestEntityStage` — только `server/src/modules/<entity>/`
- `reactEntityStage` — только `client/src/resources/<entity>/`
- `integrationStage` — только `app.module.ts`, `App.tsx`, `dataProvider.ts`

Это страховка от «творчества» LLM, которая иногда пытается заодно отредактить
шаблоны или auth.

### Bounded repair (один проход)

Каждая LLM-стадия запускается через
[`runStageWithRepair()`](src/generator/repair.ts). Алгоритм:

1. Стадия пишет файлы в `/tmp/jobs/<jobId>`.
2. Запускается структурный валидатор.
3. Если валидатор ругается на файлы, **которые принадлежат текущей стадии**,
   стадия запускается повторно — ровно один раз — с заполненным
   `previousError` (текстом ошибки валидатора).
4. Если после второго прохода ошибка не ушла — job падает с `failed`. Третьей
   попытки нет.

Логика владения файлами и парсинг ошибок валидатора — в
[`src/generator/repair.ts`](src/generator/repair.ts).

---

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `PORT` | нет (по умолчанию `3030`) | Порт HTTP-сервера экспортера |
| `CALLBACK_BASE_URL` | **да** | Базовый URL для прогресс-коллбэков обратно в AID |
| `AI_API_URL` | **да** | Endpoint chat completions OpenRouter (или совместимого) |
| `AI_API_KEY` | **да** | API-ключ LLM-провайдера |
| `AI_MODEL` | **да** | ID модели (например, `anthropic/claude-opus-4-6`) |
| `AI_MAX_TOKENS` | нет | Лимит токенов на запрос; по умолчанию — провайдерский потолок |
| `AI_TEMPERATURE` | нет | По умолчанию подбирается по стадии (0.2 для auth) |
| `GITEA_BASE_URL` | да для боевого деплоя | Например, `https://gitea.greact.ru` |
| `GITEA_USERNAME` | да для боевого деплоя | Owner, под которым создаются репозитории |
| `GITEA_TOKEN` | да для боевого деплоя | Personal access token со scope `repo` |
| `PORTAINER_BASE_URL` | да для боевого деплоя | База API Portainer |
| `PORTAINER_API_KEY` | да для боевого деплоя | API-ключ с правами на стеки |
| `PORTAINER_ENDPOINT_ID` | да для боевого деплоя | Числовой endpoint id |
| `PORTAINER_EXTERNAL_NETWORK` | нет (по умолчанию `proxy`) | Имя внешней Docker-сети, в которой живёт NPM |
| `NPM_BASE_URL` | да для боевого деплоя | База API Nginx Proxy Manager |
| `NPM_IDENTITY` | да для боевого деплоя | Email админа NPM |
| `NPM_SECRET` | да для боевого деплоя | Пароль админа NPM |
| `NPM_WILDCARD_CERT_ID` | да для боевого деплоя | Числовой id wildcard-сертификата `*.greact.ru` в NPM |
| `PUBLIC_DOMAIN_SUFFIX` | нет (по умолчанию `greact.ru`) | Суффикс публичного хоста для `gen-<slug>` |
| `CLEANUP_TTL_DAYS` | нет (по умолчанию `7`) | Возрастной порог для cleanup-сканера |
| `EXPORTER_MOCK_GENERATOR` | нет (по умолчанию `true`) | Если `true`, LLM-стадии пропускаются и публикуется bundled mock-проект. **На проде ставить `false`.** |

Все они читаются и валидируются в [`src/config.ts`](src/config.ts).

> Дефолт `EXPORTER_MOCK_GENERATOR=true` существует специально, чтобы тестировать
> deploy-плумбинг (Gitea/Portainer/NPM) без расхода токенов LLM. На бою его
> **обязательно** надо переключить в `false`. Ветвление здесь:
> [`src/orchestrator.ts:54-56`](src/orchestrator.ts).

---

## Сборка и запуск

Экспортер задуман как соседний сервис в `aid/docker-compose.yml` под именем
`runner-toir-fullstack-exporter`.

### Локальная пересборка

```bash
cd aid/runner/toir-fullstack-exporter

# Синхронизируем prompts/docs/tools из ../../../toir-automatization
npm run sync-context

# Собираем образ как часть AID compose-стека
docker compose -f ../../docker-compose.yml build runner-toir-fullstack-exporter
docker compose -f ../../docker-compose.yml up -d runner-toir-fullstack-exporter
```

`prebuild` автоматически зовёт `sync-context` при `npm run build`, так что
каталог `context/` внутри образа всегда свежий — см.
[`scripts/sync-context.mjs`](scripts/sync-context.mjs) и `package.json`.

### Ручной запуск job (для отладки)

В проде job всегда стартует из UI AID, но можно дёрнуть напрямую:

```bash
curl -XPOST http://localhost:3030/start \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"manual-1","path":"/workspace/toir-automatization/domain/toir.api.dsl"}'
```

Endpoint сразу возвращает `202 {"received":true}` и крутит job асинхронно;
прогресс смотрите в AID или в логах контейнера. Реализация — в
[`src/index.ts`](src/index.ts).

---

## Как протестировать end-to-end

1. В AID откройте `toir-automatization/domain/toir.api.dsl`.
2. Нажмите **Export → toir-fullstack**. В панели jobs появится новый job.
3. Следите за прогрессом — должны прийти строки от каждой стадии:
   `[fetch]`, `[contract-freeze]`, `[scaffold]`, `[prisma]`, `[nest-entities]`,
   `[react-entities]`, `[integration]`, `[auth]`, `[post-process]`,
   `[validate]`, `[gitea]`, `[portainer]`, `[npm]`.
4. На успехе job переходит в `completed` с публичным URL, а рядом с DSL
   появляется sidecar `domain/toir.api.deploy.md` (формат — функция
   `renderDeployMd()` в [`src/orchestrator.ts:233-245`](src/orchestrator.ts)).
5. Откройте URL в браузере. Ожидаем:
   - Редирект на Keycloak (`https://sso.greact.ru/realms/toir/...`).
   - После логина грузится оболочка React Admin.
   - Все пункты меню в левом сайдбаре кликабельны; списки рендерятся либо с
     данными, либо с empty state (но никогда — с необработанной ошибкой).
   - Минимум для `Equipment` и `ChangeEquipmentStatus` можно создать запись,
     отредактировать её и удалить.

### Проверка персистентности БД

У каждого сгенерированного стека свой PostgreSQL под именем
`gen-<slug>-postgres`. Чтобы убедиться, что данные действительно сохраняются:

```bash
# На хосте Portainer
docker exec -it gen-<slug>-postgres psql -U toir -d toir -c '\dt'
docker exec -it gen-<slug>-postgres psql -U toir -d toir -c 'SELECT * FROM "Equipment";'
```

---

## Известные ограничения

Это принятый техдолг: workaround есть, прод не блокируется, но знать стоит.

### Keycloak redirect URIs не провижатся автоматически
Keycloak не поддерживает wildcard в hostname поля «Valid Redirect URIs» — только
wildcard в path. Каждый новый `gen-<slug>.greact.ru/*` приходится **руками**
добавлять в админке Keycloak до первой попытки логина. Phase 13.5 (`src/keycloak/`)
несёт планируемую автоматизацию через Keycloak Admin API; пока её нет — ручной
шаг на каждый деплой. **Симптом:** после клика на «Login» Keycloak отвечает
`Invalid parameter: redirect_uri`. **Фикс:** добавить
`https://gen-<slug>.greact.ru/*` в клиент `toir-frontend` в realm.

### Auth-стадия всё ещё ходит в LLM
Auth-слой одинаков во всех генерируемых приложениях и зависит только от
значений env vars — то есть это сильный кандидат на фиксированный шаблон в
`context/scaffold/auth/`. В файле
[`src/generator/stages/authStage.ts:25-29`](src/generator/stages/authStage.ts)
есть комментарий `TODO Phase 14 candidate`. Если поймаете нестабильность —
рекомендованный фикс: (а) положить выверенные файлы в `context/scaffold/auth/`,
(б) заменить тело `runAuthStage` на детерминированное копирование. Плумбинг для
этого уже готов в [`src/generator/scaffold.ts`](src/generator/scaffold.ts).

### `EXPORTER_MOCK_GENERATOR=true` — это дефолт
Сделано специально, чтобы тестировать деплой без LLM-расходов, но в случае
криво сконфигурированного прод-окружения экспортер **молча** опубликует mock.
**Всегда проверяйте, что в проде стоит `EXPORTER_MOCK_GENERATOR=false`.**
Дефолт прибит в [`src/config.ts:48`](src/config.ts).

### Let's Encrypt rate limits
Per-deploy сертификаты в загруженные дни упираются в LE rate limit. Экспортер
ожидает заранее выпущенный wildcard `*.greact.ru` в NPM
(`NPM_WILDCARD_CERT_ID`) и переиспользует его на каждом proxy host.
**Не переключайтесь на per-host LE.**

### Нет app-level health probe после деплоя
Portainer считает стек запущенным как только контейнеры стартанули, но это не
гарантия, что React-оболочка реально отвечает на публичном URL. Экспортер
сейчас не пингует публичный URL перед тем, как отчитаться `completed`. Если
deploy ушёл в `completed`, но URL первые ~10 секунд отдаёт 502 — дайте NPM
зарегистрировать апстрим и обновите страницу.

### `/tmp/jobs/` копится
Каждый job оставляет каталог `/tmp/jobs/<jobId>/` для post-mortem. Перезапуск
контейнера или периодический `rm -rf /tmp/jobs` чинит. Это **сделано
специально** — см. раздел «Неочевидные решения».

### Volumes не вычищаются при удалении стека
Docker-вольюмы удалённого сгенерированного стека Portainer не сносит сам.
Cleanup-сканер ([`src/cleanup/scanner.ts`](src/cleanup/scanner.ts)) подбирает
их по расписанию (`CLEANUP_TTL_DAYS`), но при массовом удалении стеков может
пригодиться разовый ручной `docker volume prune`.

---

## Troubleshooting

| Симптом | Причина | Фикс |
|---|---|---|
| `Missing required environment variables: ...` на старте | Не выставлены обязательные переменные | См. таблицу выше; перезапустить контейнер. Проверка — [`src/config.ts:1-7`](src/config.ts) |
| Job висит на `[gitea] Pushing project` | В образе нет бинарника `git` | Это уже починено через `apk add git` в [`Dockerfile`](Dockerfile); проверьте, что образ пересобран |
| Job падает на `[portainer] Waiting for stack ... to start` | Неверное имя внешней сети | Выставить `PORTAINER_EXTERNAL_NETWORK` в имя сети, к которой подключён NPM |
| Job падает на `[npm] Creating proxy host` с HTTP 401 | NPM JWT истёк прямо в процессе | Auto-refresh обёртка есть в [`src/npm/client.ts`](src/npm/client.ts); проверьте креды |
| Job падает на `[validate] Validator failed` после ремонтного прохода | LLM два раза подряд выдала битый структурный вывод | Зайдите в `/tmp/jobs/<jobId>` внутри контейнера — файлы остались на месте; сравните с замороженным контрактом. Парсинг ошибок — в [`src/generator/repair.ts`](src/generator/repair.ts) |
| В браузере `Invalid parameter: redirect_uri` после Keycloak | Per-deploy redirect URI не добавлен в realm | См. «Keycloak redirect URIs» выше |
| React Admin грузится, но все списки 401 | Бэкенд не достучался до JWKS, либо несовпадение `KEYCLOAK_AUDIENCE` | Смотрите в логах бэка строки `[jwks]`; сверяйте env vars в сгенерированном `docker-compose.yml` |
| Deploy в `completed`, но URL отдаёт 502 | NPM ещё не подхватил апстрим | Подождать 5–10 секунд; если не уходит — проверить, что Portainer стек реально `running` |
| В логах экспортера видно `EXPORTER_MOCK_GENERATOR=true` на проде | Дефолт не переопределили | Поставить `EXPORTER_MOCK_GENERATOR=false` в `aid/.env` и перезапустить контейнер |

---

## Cleanup

В экспортере есть отдельная CLI-команда, которая сносит все деплои старше
`CLEANUP_TTL_DAYS`:

```bash
# Внутри контейнера экспортера
npm run cleanup
```

Сканер ([`src/cleanup/scanner.ts`](src/cleanup/scanner.ts)) обходит стеки
Portainer по маске `gen-*`, и для каждого протухшего slug удаляет — в
порядке — NPM proxy host, Portainer stack, Gitea repo. Падения логируются, но
не блокируют дальнейшее удаление. Точка входа CLI —
[`src/cleanup/index.ts`](src/cleanup/index.ts).

Если надо снести один конкретный slug руками:

```bash
docker exec -it runner-toir-fullstack-exporter \
  node -e "import('./src/cleanup/index.js').then(m => m.removeSlug('gen-20260408-abcdef12'))"
```

---

## Сводка по Phase 14 (acceptance)

Это рабочий журнал полировочного прохода Phase 14.

**Проверено детерминированно (только code review):**
- Структура пайплайна и порядок стадий в
  [`src/orchestrator.ts`](src/orchestrator.ts) совпадают с планом Phase 7–13.5.
- Failure-путь сохраняет исходную ошибку и зовёт `rollback()` best-effort, не
  затирая её — [`src/orchestrator.ts:66-102`](src/orchestrator.ts).
- Auth-стадия фильтрует вывод по своим разрешённым префиксам —
  [`src/generator/stages/authStage.ts:13,46-53`](src/generator/stages/authStage.ts).
- `EXPORTER_MOCK_GENERATOR` по умолчанию `true` —
  [`src/config.ts:48`](src/config.ts), задокументировано как footgun в трёх
  местах README.
- [`scripts/sync-context.mjs`](scripts/sync-context.mjs) перечисляет все
  prompts, на которые ссылаются стадии; рассинхрона нет.

**Не проверено в этом проходе — нужен runtime-проход от оператора:**
- Реальный end-to-end прогон на `domain/toir.api.dsl` из UI AID.
- Браузерный логин Keycloak на свежем `gen-<slug>.greact.ru`.
- Ручной CRUD-смоук на трёх представительных сущностях.
- Замер wall-time на каждой стадии и общий.
- Запись демо.

После того, как runtime-проверки пройдут, экспортер можно считать
production-ready, всё остальное — в follow-up тикеты.

### Неочевидные решения, которые стоит знать

- **Дефолт mock-generator поставлен специально.** Phase 5 deploy-плумбинг
  валидировался на bundled mock-проекте до того, как появились LLM-стадии, и
  флаг остался в `true`, чтобы будущая отладка инфры не требовала токенов.
  Прод обязан переопределить — README предупреждает об этом в трёх местах
  специально.
- **Валидатор бежит ПОСЛЕ `post-process`, не до.** Container naming и инжект
  внешней сети происходят в детерминированном пост-проходе; валидатор уже
  смотрит на тот файл, который оператор реально задеплоит, а не на сырое
  LLM-output. Порядок зафиксирован в
  [`src/orchestrator.ts:167-187`](src/orchestrator.ts).
- **One-pass repair, а не «retry until success».** Каждой LLM-стадии разрешён
  ровно один ремонтный проход. Логика: вторая ошибка на той же стадии почти
  всегда означает, что не так либо промпт, либо контракт; молчаливое
  закольцовывание только жжёт токены и прячет реальную проблему. См.
  [`src/generator/repair.ts`](src/generator/repair.ts).
- **`rollback()` задокументирован как «никогда не бросает», но оркестратор всё
  равно оборачивает его в try/catch.** Подстраховка: баг в rollback не должен
  затирать исходную ошибку, которую AID должен показать оператору.
- **Рабочий каталог job — `/tmp/jobs/<jobId>`, а не tmpdir.** Сделано
  специально, чтобы упавшие jobs можно было разобрать прямо из контейнера. В
  паре со stateless-перезапусками это даёт самый короткий цикл отладки.
