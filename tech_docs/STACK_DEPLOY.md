# Развёртывание связки одной командой

Поднять Superset вместе с `file-storage` из одного compose-файла
[`docker-compose-stack.yml`](../docker-compose-stack.yml) — без внешней сети и без
хождения по двум каталогам.

Оба сервиса берутся **готовыми образами из ghcr.io**, ничего не собирается на
месте. Как образы туда попадают — [RELEASE_CYCLE.md](RELEASE_CYCLE.md).

> Раздельный вариант (два стека, соединённые сетью `superset_shared`) описан в
> [FILE_UPLOADER_DEPLOY.md](FILE_UPLOADER_DEPLOY.md).
> Он нужен, когда половины обновляются независимо друг от друга.

---

## 1. Что поднимается

| Сервис | Контейнер | Наружу |
|---|---|---|
| Superset | `superset_app` | **:8088** — единственный публикуемый порт |
| Миграции и права (отработал → вышел) | `superset_init` | — |
| Celery worker / beat | `superset_worker`, `superset_worker_beat` | — |
| MCP | `superset_mcp` | — (только внутри сети) |
| БД метаданных Superset | `superset_db` | — |
| Redis | `superset_cache` | — |
| file-storage | `storage_app` | — |
| БД реестра файлов | `storage_db` | — |
| MinIO | `storage_minio` | — |

Браузер ходит только на Superset. К `file-storage` он обращается через серверный
прокси, который подставляет `X-API-Key`, — ключ никогда не попадает в браузер.

---

## 2. Разовая подготовка

### Логин в реестр

Пакеты приватные, без логина `pull` вернёт `403 Forbidden`:

```bash
echo <ТОКЕН> | docker login ghcr.io -u <github-логин> --password-stdin
```

Токен — **Personal Access Token (classic)** со scope `read:packages`.
Fine-grained-токены ghcr не принимает и отвечает `denied: denied`. Логин `-u` —
личный GitHub-ник, не название организации.

Проверить токен до логина:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: token ВАШ_ТОКЕН" https://api.github.com/user
```
`200` — токен живой, `401` — недействителен или истёк.

### Секреты

Правятся в тех же файлах, что и при раздельном деплое:

**`superset_tech/docker/.env-local`**
```env
STORAGE_BASE_URL=http://file-storage:8000
STORAGE_API_KEY=<СИЛЬНЫЙ_СЛУЧАЙНЫЙ_КЛЮЧ>
```

**`services/file-storage/.env`**
```env
API_KEY=<ТОТ_ЖЕ_КЛЮЧ_ЧТО_STORAGE_API_KEY>
S3_ACCESS_KEY=<СИЛЬНЫЙ>
S3_SECRET_KEY=<СИЛЬНЫЙ>
S3_BUCKET=files
POSTGRES_USER=<пользователь>
POSTGRES_PASSWORD=<СИЛЬНЫЙ>
POSTGRES_DB=<база>
```

`STORAGE_API_KEY` и `API_KEY` — **один общий секрет**, они обязаны совпадать.
Сгенерировать: `openssl rand -hex 32`.

> `DATABASE_URL` из `.env` этот compose переопределяет сам: Postgres реестра
> здесь отзывается на имя `storage-postgres`, а не `postgres`.

---

## 3. Запуск

Команды выполняются **из каталога `superset_tech/`** — оттуда compose видит и
свой `docker/`, и соседний `../services/file-storage/.env`.

```bash
export SUPERSET_TAG=0.0.1-techpeople.22   # из GitHub → Packages
export STORAGE_TAG=0.0.4

docker compose -f docker-compose-stack.yml pull
docker compose -f docker-compose-stack.yml up -d
```

Оба тега обязательны: без них compose останавливается с внятной ошибкой и не
подставляет `latest` — иначе никто не скажет, что именно развёрнуто.

Обновление версии — поменять тег и повторить те же две команды.

---

## 4. Проверка

```bash
# 1. Что развёрнуто
docker exec superset_app printenv TECHPEOPLE_FRONTEND_VERSION

# 2. Superset жив
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/health   # 200

# 3. Init отработал все шаги
docker logs superset_init 2>&1 | grep "Init Step"                       # 4/4 Complete

# 4. Связка: Superset видит file-storage
docker exec superset_app python3 -c "
import os, urllib.request
b=os.environ['STORAGE_BASE_URL']
print(urllib.request.urlopen(b+'/healthz', timeout=10).read().decode())"
```

Дальше — войти на `http://localhost:8088` (по умолчанию `admin` / `admin`,
пароль задаётся `ADMIN_PASSWORD`) и открыть **Settings → Manage → Files**:
список должен грузиться, загрузка файла — проходить.

**Изоляция отказов**: `docker stop storage_app` → страница Files открывается,
показывает баннер «File storage is currently unavailable» и кнопку Retry,
остальной Superset работает.

---

## 5. Грабли

### Первая загрузка файла падает с `NoSuchBucket`

Исправлено: сервис создаёт бакет при старте. Симптом остаётся на образах
file-storage **старше `0.0.5`** — там `ensure_bucket()` был написан, но не
вызывался, и на чистом томе MinIO первая же загрузка возвращала 502.

Если поднимаете старый образ, бакет создаётся вручную:

```bash
docker exec storage_app python3 -c \
  "from app.storage import ObjectStore; ObjectStore().ensure_bucket()"
```

### База `examples` создаётся ровно один раз в жизни тома

Postgres выполняет скрипты из `docker-entrypoint-initdb.d` **только когда каталог
данных пуст**. Если первый `up` прошёл с неполным `.env` или упал на полпути, том
`db_home` уже помечен инициализированным — и база `examples` не появится больше
никогда. Ошибки при этом не будет, симптом: «развернули, а база пустая».

```bash
docker exec superset_db psql -U superset -l          # есть ли examples
docker logs superset_init 2>&1 | tail -40            # где встал init
```

Создать вручную теми же значениями, что в `docker/.env`:

```bash
docker exec -i superset_db psql -U superset <<'SQL'
CREATE USER examples WITH PASSWORD '<EXAMPLES_PASSWORD>';
CREATE DATABASE examples;
GRANT ALL PRIVILEGES ON DATABASE examples TO examples;
SQL
docker exec -i superset_db psql -U superset -d examples \
  -c "GRANT ALL ON SCHEMA public TO examples;"
docker exec superset_app superset load_examples
```

Если демо-датасеты не нужны — `SUPERSET_LOAD_EXAMPLES=no` в `docker/.env-local`.

### Воркеры и MCP в бесконечном рестарте

Исправлено: образ ставит `.[postgres,fastmcp]`. Симптом остаётся на образах
Superset **старше `0.0.1-techpeople.23`** — в них нет ни драйвера Postgres, ни
зависимостей MCP:

- `superset_worker` и `superset_worker_beat` падают с `ModuleNotFoundError: No
  module named 'psycopg2'`. `superset_app` при этом работает, потому что
  `docker-bootstrap.sh` доставляет драйвер при старте, а для `worker` и `beat`
  этот шаг намеренно пропущен. Следствие — не работают алерты, отчёты и
  фоновые задачи.
- `superset_mcp` выходит с `MCP service dependencies not installed: No module
  named 'uvicorn'`, а Superset на каждом старте пишет `fastmcp is not
  installed, skipping MCP initialization`.

Обходного пути на уровне деплоя нет: нужен образ новой сборки.

### `no matching manifest for linux/arm64`

Образы собираются только под `linux/amd64`. В compose проставлен
`platform: linux/amd64` — на x86-сервере это ничего не меняет, а на Apple Silicon
включает эмуляцию. Убирать эту строку не нужно.

---

## 6. Данные и бэкап

| Том | Что внутри |
|---|---|
| `db_home` | метаданные Superset: дашборды, чарты, пользователи |
| `superset_home` | конфиг и кэш Superset |
| `storage_pg_data` | реестр файлов (таблица `files`) |
| `minio_data` | сами файлы |
| `redis` | очереди Celery, кэш |

Бэкапить `storage_pg_data` и `minio_data` **согласованно** — это две половины
одних данных: запись в реестре без файла в хранилище бесполезна, и наоборот.

Остановить без потери данных:
```bash
docker compose -f docker-compose-stack.yml down
```

Удалить вместе с данными (необратимо):
```bash
docker compose -f docker-compose-stack.yml down -v
```

---

## 7. Права доступа

После деплоя в **Settings → List Roles** назначить ролям права на меню-объекте
`FileUploader`:

- `can view` — видеть страницу и список, скачивать, превью
- `can upload` — загружать
- `can edit` — менять имя, папку, теги
- `can delete` — удалять

Пункт меню **Files** виден только при наличии `can view`. Права проверяются на
сервере в каждом методе прокси; фронтенд лишь скрывает недоступные кнопки.
