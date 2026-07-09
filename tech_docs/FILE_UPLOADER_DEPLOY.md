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

---

## 1. Принцип (чем прод отличается от локалки)

| Аспект | Локально (dev) | Прод |
|---|---|---|
| Код в контейнере | bind-mount `./superset` с хоста (правки видны сразу) | **Только внутри образа** (build → registry → pull) |
| Сеть | external-сеть `superset_shared`, объявлена в `docker-compose.yml` | **external-сеть, объявленная в compose** |
| Секреты | дефолты (`change-me-dev-key`, `minioadmin`) | **сильные значения через env сервера** |
| Порты наружу | проброшены 8000/9100/9101/5432 | **только Superset :8088** (за nginx) |

Никаких `docker cp` и ручных `network connect` на проде. Всё воспроизводимо из git + env.

---

## 1a. Локальная разработка (dev-стек, с нуля)

Для разработки (правишь код Superset и видишь изменения) поднимается **dev-стек**
`docker-compose.yml` — в отличие от прод-стека `docker-compose-non-dev.yml` он:

- монтирует `./superset` и `./superset-frontend` с хоста (правки Python видны сразу);
- имеет контейнер **`superset-node`** — webpack dev-server, который собирает фронтенд
  и кладёт ассеты в `superset/static/assets/` (без него UI пустой — белый экран).

> Для правок **фронтенда** нужен именно dev-стек (`superset-node` пересобирает на
> лету). Для правок только бэкенда хватит и non-dev. UI «побился» / белый экран =
> ассеты не собраны → подними dev-стек и дай `superset-node` их собрать.

### Порядок запуска с нуля

```bash
# 0. Один раз: общая сеть (к ней подключены оба стека)
docker network create superset_shared     # если уже есть — команда просто отдаст ошибку, это ок

# 1. file-storage (свой стек)
cd services/file-storage
cp -n .env.example .env                    # дефолтов достаточно для локалки
docker compose -f docker-compose.storage.yml up -d --build

# 2. Superset (dev-стек)
cd ../../superset_tech
#   docker/.env-local уже содержит STORAGE_BASE_URL + STORAGE_API_KEY (см. раздел 4)
docker compose -f docker-compose.yml up -d --build
```

Первый запуск долгий: сборка образа без кэша + миграции + загрузка демо-примеров
(контейнер `superset-init` отрабатывает и выходит с кодом 0 — это норма). Дождись,
пока `superset` станет `healthy`.

### Связь между стеками

Оба compose-файла объявляют external-сеть `superset_shared`, а сервис `superset`
к ней подключён. Поэтому Superset достаёт file-storage по DNS-имени
`http://file-storage:8000` (значение `STORAGE_BASE_URL`) — ручной `network connect`
не нужен. Если сеть не создана, `up` упадёт с `network superset_shared declared as
external, but could not be found` → выполни `docker network create superset_shared`.

### Проверка

```bash
curl localhost:8000/healthz        # file-storage -> {"status":"ok"}
curl localhost:8088/health         # Superset     -> OK (200)
```

Затем войти в Superset (`admin`/`admin`) → **Settings → Manage → Files**: список
грузится = связка работает. Хостовые адреса сервисов file-storage — см.
`services/file-storage/README.md` (веб-консоль `:8000`, MinIO `:9101`, Postgres `:5442`).

---

## 2. Образы

Оба сервиса едут на сервер как образы из registry (DockerHub, как в
[FRONTEND_DEV_GUIDE.md](FRONTEND_DEV_GUIDE.md): git-тег → GitHub Actions → DockerHub).

- **Superset**: собирается из этого репозитория (фронт собирается webpack-ом внутрь
  образа при `DEV_MODE=false`, т.е. через `docker-compose-non-dev.yml` build или
  CI). Образ содержит страницу File Uploader и прокси-view.
- **file-storage**: собирается из своего репозитория (его `Dockerfile`).

> Важно: любые правки кода фичи (например прокси/перменты) попадают на прод
> ТОЛЬКО после пересборки соответствующего образа. Подкладка `docker cp`,
> используемая в dev для быстрой проверки, на проде неприменима.

---

## 3. Сеть

Superset и file-storage деплоятся как два compose-стека и общаются по общей
**external** docker-сети `superset_shared`. Эта сеть уже объявлена в обоих
compose-файлах:

- `superset_tech/docker-compose-non-dev.yml` — сервис `superset` подключён к
  `default` + `superset_shared`.
- `services/file-storage/docker-compose.storage.yml` — сервис `file-storage`
  подключён к `default` + `superset_shared`.

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

В прод-варианте compose НЕ публиковать наружу:
- `file-storage` `:8000`
- MinIO `:9000` / `:9001`
- Postgres `:5432`

Эти сервисы доступны Superset-у по внутренней сети `superset_shared` и не нужны в
интернете. Убрать их `ports:` (или забиндить на `127.0.0.1:` для отладки на самом
сервере). Это и есть смысл серверного прокси: API-ключ и storage не светятся наружу.

> Локальная правка портов MinIO на `9100/9101` в
> `docker-compose.storage.yml` — это dev-костыль из-за конфликта с фронтовым
> dev-server (порт 9000) на машине разработчика. На проде dev-server нет; на проде
> MinIO наружу вообще не публикуется, так что проброс портов можно убрать.

---

## 6. Порядок развёртывания на сервере

```bash
# 0. Один раз: общая сеть
docker network create superset_shared

# 1. file-storage
cd services/file-storage
#   проставить его .env (API_KEY, S3_*, DATABASE_URL) — см. раздел 4
docker compose -f docker-compose.storage.yml pull        # если образ из registry
docker compose -f docker-compose.storage.yml up -d

# 2. Superset
cd ../../superset_tech
#   проставить docker/.env(.local): STORAGE_BASE_URL, STORAGE_API_KEY — см. раздел 4
docker compose -f docker-compose-non-dev.yml pull
docker compose -f docker-compose-non-dev.yml up -d
```

После старта Superset (init-контейнер прогоняет миграции и FAB создаёт права)
автоматически появятся 4 permission: `can view/upload/edit/delete on FileUploader`.

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

Бэкапить оба тома согласованно. Это данные file-storage; БД метаданных Superset —
отдельная (своя у Superset).
