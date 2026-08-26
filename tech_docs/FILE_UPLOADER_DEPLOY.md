# Деплой: File Uploader (Superset + file-storage) на прод

Как развернуть страницу **Files** (Settings → Manage → Files) в Superset вместе с
сервисом хранения `file-storage` на проде через `docker compose` на сервере.

Фича состоит из двух частей:

1. **Superset** (этот репозиторий) — React-страница `/fileuploader/` + серверный
   прокси `FileUploaderView`, который проксирует запросы браузера к `file-storage`,
   подставляя `X-API-Key` на стороне сервера (ключ никогда не попадает в браузер).
2. **file-storage** (отдельный репозиторий/образ) — FastAPI + MinIO + Postgres,
   хранит файлы и отдаёт их по REST (`/files`, `/files/{id}/content`, …).

Браузер ходит ТОЛЬКО на Superset (тот же origin). Superset ходит на `file-storage`
по внутренней docker-сети. Наружу публикуется только Superset.

> Здесь описан деплой **двумя стеками**, соединёнными внешней сетью — так каждую
> половину можно обновлять независимо. Если это не нужно, есть вариант проще:
> [STACK_DEPLOY.md](STACK_DEPLOY.md) поднимает обе половины одним compose-файлом
> и одной командой, без внешней сети.

---

## 1. Принцип (чем прод отличается от локалки)

| Аспект | Локально (dev) | Прод |
|---|---|---|
| Код в контейнере | `docker cp` в работающий контейнер | **Только внутри образа** (git-тег → CI → ghcr → pull) |
| compose-файл | `docker-compose-non-dev.yml` / `docker-compose.storage.yml` (собирают на месте) | `docker-compose-prod.yml` / `docker-compose.prod.yml` (тянут готовый образ) |
| Сеть | `docker network create` + ручной `connect` | **external-сеть, объявленная в compose** |
| Секреты | дефолты (`change-me-dev-key`, `minioadmin`) | **сильные значения через env сервера** |
| Порты наружу | проброшены 8000/9100/9101/5442 | **только Superset :8088** (за nginx) |

Никаких `docker cp` и ручных `network connect` на проде. Всё воспроизводимо из git + env.

---

## 2. Образы

Оба сервиса едут на сервер как образы из **ghcr.io**. Сборка идёт в GitHub
Actions по git-тегу, на сервере ничего не компилируется. Полный цикл релиза —
[RELEASE_CYCLE.md](RELEASE_CYCLE.md).

| Сервис | Тег git | Образ |
|---|---|---|
| Superset | `*-techpeople.*` | `ghcr.io/techpeopleorg/superset_tech:<тег>` |
| file-storage | `v*` (буква `v` срезается) | `ghcr.io/techpeopleorg/file-storage:<версия>` |

Образ Superset содержит собранный фронт (страницу File Uploader) и прокси-view;
образ file-storage — FastAPI-сервис.

Готовые теги смотреть в GitHub → Packages организации.

> Важно: любые правки кода фичи (например прокси/пермишены) попадают на прод
> ТОЛЬКО после пересборки образа — то есть после нового git-тега и прогона CI.
> Подкладка `docker cp`, используемая в dev для быстрой проверки, на проде
> неприменима.

> Пакеты приватные, поэтому на сервере нужен разовый логин в реестр:
> ```bash
> echo <ТОКЕН> | docker login ghcr.io -u <github-логин> --password-stdin
> ```
> Токен — Personal Access Token (classic) со scope `read:packages`.

---

## 3. Сеть

Superset и file-storage деплоятся как два compose-стека и общаются по общей
**external** docker-сети `superset_shared`. Эта сеть уже объявлена в обоих
compose-файлах:

- `superset_tech/docker-compose-prod.yml` — сервис `superset` подключён к
  `default` + `superset_shared`.
- `services/file-storage/docker-compose.prod.yml` — сервис `file-storage`
  подключён к `default` + `superset_shared`.

(Те же подключения есть и в dev-вариантах — `docker-compose-non-dev.yml` и
`docker-compose.storage.yml`.)

На сервере один раз создать сеть до первого `up`:

```bash
docker network create superset_shared
```

После этого `file-storage` доступен Superset-у по имени `http://file-storage:8000`
(имя сервиса = DNS-имя в общей сети). Менять ничего вручную не нужно.

> Альтернатива (ещё чище): держать оба сервиса в одном compose-файле — тогда они
> автоматически в одной сети и `superset_shared` не нужна. external-сеть выбрана
> потому, что стеки деплоятся раздельно.

---

## 4. Секреты и переменные окружения

### Superset (`docker/.env` или `docker/.env-local` на сервере)

```env
STORAGE_BASE_URL=http://file-storage:8000
STORAGE_API_KEY=<СИЛЬНЫЙ_СЛУЧАЙНЫЙ_КЛЮЧ>     # НЕ дефолтный change-me-dev-key
# таймауты прокси (необязательно, дефолты 3 / 30):
# STORAGE_PROXY_CONNECT_TIMEOUT=3
# STORAGE_PROXY_READ_TIMEOUT=30
```

### file-storage (его `.env` на сервере)

Сервис читает pydantic Settings со следующими именами:

```env
API_KEY=<ТОТ_ЖЕ_СИЛЬНЫЙ_КЛЮЧ_ЧТО_STORAGE_API_KEY_У_SUPERSET>
DATABASE_URL=postgresql+psycopg2://<user>:<pass>@postgres:5432/<db>
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=<СИЛЬНЫЙ>
S3_SECRET_KEY=<СИЛЬНЫЙ>
S3_BUCKET=files
S3_REGION=us-east-1
```

Правила:
- `STORAGE_API_KEY` (Superset) и `API_KEY` (file-storage) **должны совпадать** — это
  один общий секрет. Сгенерировать, например: `openssl rand -hex 32`.
- MinIO/Postgres креды — сильные, не `minioadmin`/`superset`.
- Секреты не коммитить; задавать через env сервера или secrets-менеджер.

---

## 5. Порты (что публиковать наружу)

Наружу (через nginx/reverse-proxy + TLS) — **только Superset** (`:8088`).

В `docker-compose.prod.yml` наружу не публикуется НИЧЕГО — ни `file-storage`
`:8000`, ни MinIO `:9000/:9001`, ни Postgres. Эти сервисы доступны Superset-у по
внутренней сети `superset_shared` и не нужны в интернете. Это и есть смысл
серверного прокси: API-ключ и storage не светятся наружу.

> Проброс портов `9100/9101` (MinIO) и `5442` (Postgres) есть только в dev-файле
> `docker-compose.storage.yml` — это обход конфликта с фронтовым dev-server
> (порт 9000) и собственным Postgres Superset на машине разработчика. Не
> переносить эти `ports:` в прод: `5442` наружу — это база с паролем из `.env`,
> открытая в интернет, если сервер не прикрыт файрволом.

---

## 6. Порядок развёртывания на сервере

```bash
# 0. Разово: логин в реестр (см. раздел 2) и общая сеть
echo <ТОКЕН> | docker login ghcr.io -u <github-логин> --password-stdin
docker network create superset_shared

# 1. file-storage
cd services/file-storage
#   проставить .env (API_KEY, S3_*, POSTGRES_*, DATABASE_URL) — см. раздел 4
export STORAGE_TAG=<версия>          # напр. 0.0.4, из GitHub → Packages
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 2. Superset
cd ../../superset_tech
#   проставить docker/.env-local: STORAGE_BASE_URL, STORAGE_API_KEY — см. раздел 4
export SUPERSET_TAG=<тег>            # напр. 0.0.1-techpeople.22
docker compose -f docker-compose-prod.yml pull
docker compose -f docker-compose-prod.yml up -d
```

Теги обязательны: без них compose падает с внятной ошибкой, а не подставляет
`latest` — иначе непонятно, что задеплоено. Проверить, что поднялось:

```bash
docker exec superset_app printenv TECHPEOPLE_FRONTEND_VERSION
```

После старта Superset (init-контейнер прогоняет миграции и FAB создаёт права)
автоматически появятся 4 permission: `can view/upload/edit/delete on FileUploader`.

> **Не используйте для прода** `docker-compose-non-dev.yml` и
> `docker-compose.storage.yml` — в них стоит `build`, а не `image`. `pull` для
> них молча ничего не делает, и `up` начнёт собирать образы прямо на сервере
> (фронт Superset — 15–25 минут) либо упадёт с `No such image`.

---

## 6.1. Первый запуск: база не создастся дважды

Postgres выполняет скрипты из `docker-entrypoint-initdb.d` **только когда каталог
данных пуст**, то есть при самом первом старте нового тома `db_home`. Именно там
создаётся база `examples` и её пользователь.

Отсюда типичная ловушка: если первый `up` прошёл с неполным `.env` или упал на
полпути, том уже помечен как инициализированный — и база `examples` не появится
уже никогда, сколько ни переразворачивай. Ошибки при этом не будет, симптом —
«развернули связку, а база пустая».

Проверить после первого старта:

```bash
docker exec superset_db psql -U superset -l     # в списке должна быть examples
docker logs superset_init 2>&1 | tail -40       # на каком шаге встал init
```

Если базы нет, а данные Superset терять нельзя — создать вручную теми же
значениями, что в `docker/.env` (`EXAMPLES_USER`, `EXAMPLES_PASSWORD`, `EXAMPLES_DB`):

```bash
docker exec -i superset_db psql -U superset <<'SQL'
CREATE USER examples WITH PASSWORD '<EXAMPLES_PASSWORD>';
CREATE DATABASE examples;
GRANT ALL PRIVILEGES ON DATABASE examples TO examples;
SQL
docker exec -i superset_db psql -U superset -d examples -c "GRANT ALL ON SCHEMA public TO examples;"
docker exec superset_app superset load_examples
```

Если демо-датасеты Apache на проде не нужны — проще выключить их загрузку
(`SUPERSET_LOAD_EXAMPLES=no` в `docker/.env-local`), и тогда пустая база
перестаёт быть симптомом.

---

## 7. Права доступа

Фича использует RBAC Superset. После деплоя в админке (Settings → List Roles)
назначить ролям нужные права на меню-объекте **FileUploader**:

- `can view on FileUploader` — видеть страницу и список, скачивать, превью
- `can upload on FileUploader` — загружать
- `can edit on FileUploader` — менять метаданные (имя/папка/теги)
- `can delete on FileUploader` — удалять

Пункт меню **Files** (Settings → Manage) виден только при наличии `can view`.
Сервер проверяет права на каждом методе прокси — фронт лишь скрывает недоступные
кнопки.

---

## 8. Проверка после деплоя

1. `https://<superset-host>/health` → 200.
2. Войти → в правом меню **Settings → Manage** есть **Files**.
3. Открыть Files → список грузится; загрузить файл (Name/Category/Folder/Tags);
   изменить метаданные; удалить; превью картинки/SVG.
4. **Изоляция отказов**: остановить контейнер `file-storage`
   (`docker stop <file-storage-container>`), обновить страницу Files → страница
   открывается, показывает баннер «File storage is currently unavailable» + Retry,
   кнопка Upload скрыта, остальной Superset работает. Вернуть storage → Retry
   загружает список.

---

## 9. Бэкап данных

Файлы и метаданные живут в томах file-storage:
- **MinIO** (`minio_data`) — содержимое файлов.
- **Postgres** (`pg_data`) — реестр `files` (метаданные).

Бэкапить оба тома согласованно. Это данные file-storage; БД метаданных Superset
живёт в своём томе `db_home` и бэкапится отдельно.

> Оба стека поднимают по контейнеру Postgres с хостом `postgres`/`db` и стоят в
> общей сети `superset_shared`. Дайте базе file-storage собственные имя,
> пользователя и пароль (см. `.env.example`) — при совпадающих реквизитах и
> похожих именах хостов сервис может молча подключиться к чужой базе, потому что
> пароль подойдёт и ошибки не будет.
>
> Расхождение в документации: README сервиса говорит, что реестр `files` лежит в
> той же базе, что читает Superset (чтобы дашборды запрашивали таблицу напрямую),
> а compose поднимает для него отдельный Postgres. Перед продом определиться,
> какой вариант нужен, и привести оба документа к нему.
