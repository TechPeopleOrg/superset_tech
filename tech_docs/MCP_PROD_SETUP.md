# Шпаргалка: MCP-сервер на проде + подключение к OpenClaw

Как поднять Superset MCP на проде (`superset.techpeople.ru`) и дать OpenClaw
нативно ходить в данные Superset через MCP. Связано с плагином
`OpenClawAIMcp` (ветка `feat/openclaw-mcp-chart`).

## Зачем это

Чат-плагин `OpenClawAIMcp` рассчитан на LLM с нативным function-calling. Но
текущий OpenClaw (`openclaw/*`, агент поверх DeepSeek) **не отдаёт `tool_calls`
наружу** — проверено на всех 8 моделях. Поэтому фронтовый MCP-цикл плагина с
OpenClaw не работает.

**Рабочий путь — подключить MCP к самому OpenClaw.** OpenClaw умеет быть
MCP-клиентом (`mcp.servers` в его конфиге, транспорт `streamable-http`). Тогда
47 инструментов Superset становятся для него нативными, и он зовёт их сам.

```
Браузер → OpenClaw (openclaw.techpeople.ru)
              │  (server-to-server, по внутренней сети)
              ▼
          Superset MCP (:5008)  →  Superset metadata / данные
```

> Браузерный CORS/CSP для этого пути НЕ нужен — OpenClaw ходит в MCP сервер-к-серверу,
> а не из вкладки. Это упрощает и безопаснее.

---

## Что уже готово в образе

MCP-сервер — часть Superset (`superset/mcp_service/`, CLI `superset mcp run`).
Он **уже внутри** прод-образа (`target: lean`), который собирает
`techpeople-build.yml` по тегу `*-techpeople.*`. Отдельно добавлять код не нужно.

Чего НЕ хватает: образ по умолчанию запускает только веб (`run-server.sh`).
MCP надо **запустить отдельным процессом** и **настроить прод-конфиг**.

---

## Шаг 1. Прод-конфиг MCP (`superset_config.py` на сервере)

> ⚠️ НЕ копируй dev-флаги из `docker/pythonpath_dev/superset_config.py` — там
> `MCP_AUTH_ENABLED = False` и CORS на `localhost`. Для прода это дыра.

Добавь в прод-`superset_config.py`:

```python
# --- Superset MCP (prod) ---
# Включаем авторизацию. Самый простой способ — API key пользователя Superset.
FAB_API_KEY_ENABLED = True       # РАЗРЕШИТЬ создание ключей (по умолчанию False!)
MCP_API_KEY_ENABLED = True       # MCP принимает эти ключи
MCP_AUTH_ENABLED = True          # замок включён
MCP_RBAC_ENABLED = True          # инструменты уважают права пользователя ключа

# Дев-режим без замка (MCP_AUTH_ENABLED=False, MCP_DEV_USERNAME="admin")
# допустим ТОЛЬКО когда :5008 гарантированно НЕ виден из интернета (одна
# приватная сеть). Для разных серверов (наш случай) — НЕ использовать.
```

> 🔴 **Наш случай — Superset и OpenClaw на РАЗНЫХ серверах.** Значит MCP должен
> быть доступен OpenClaw по сети, то есть публично (или через приватный туннель,
> см. ниже). Публичный MCP **без замка = полный доступ к боевому Superset для
> кого угодно**. Поэтому `MCP_AUTH_ENABLED = True` + ключ — **обязательны с
> первого дня**, этап «потестить без ключа» в этом сценарии пропускается.

CORS/CSP под прод нужны ТОЛЬКО если оставляешь браузерный путь плагина
(на будущее, при смене провайдера на LLM с function-calling). Для пути «через
OpenClaw» — не трогай. Если всё же понадобится:

```python
MCP_CORS_ALLOWED_ORIGINS = ["https://superset.techpeople.ru"]
# и добавить "https://<mcp-origin>" в CSP connect-src (superset/config.py)
```

## Шаг 2. Запустить MCP как процесс

Команда одна и та же везде: `superset mcp run --host 0.0.0.0 --port 5008`
(в репо это режим `mcp` в `docker/docker-bootstrap.sh`). Способ зависит от того,
чем поднимается прод — возьми подходящий блок.

> Примечание: bootstrap-режим `mcp` запускает с `--debug`. Для прода лучше без него —
> запускай команду напрямую (см. ниже), либо убери `--debug` из bootstrap.

### Вариант A — docker-compose на сервере

Добавь сервис рядом с основным (тот же образ, другая команда):

```yaml
  superset-mcp:
    image: <тот_же_образ_что_и_superset>   # ghcr.io/.../superset:<tag>-techpeople.N
    command: ["superset", "mcp", "run", "--host", "0.0.0.0", "--port", "5008"]
    env_file: [ ... те же env, что у основного superset ... ]
    restart: unless-stopped
    # Порт наружу публиковать НЕ обязательно: если OpenClaw в той же compose-сети,
    # он достучится по имени сервиса `superset-mcp:5008`. Публикуй только при
    # внешнем доступе — и тогда обязательно с MCP_AUTH_ENABLED=True.
    # ports: ["5008:5008"]
```

### Вариант B — Kubernetes / Helm (`helm/superset/` в репо)

Отдельный Deployment + Service из того же образа:

```yaml
# mcp-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: superset-mcp }
spec:
  replicas: 1
  selector: { matchLabels: { app: superset-mcp } }
  template:
    metadata: { labels: { app: superset-mcp } }
    spec:
      containers:
        - name: mcp
          image: <тот_же_образ>
          command: ["superset", "mcp", "run", "--host", "0.0.0.0", "--port", "5008"]
          envFrom: [ { secretRef: { name: superset-env } } ]  # те же env
          ports: [ { containerPort: 5008 } ]
---
apiVersion: v1
kind: Service
metadata: { name: superset-mcp }
spec:
  selector: { app: superset-mcp }
  ports: [ { port: 5008, targetPort: 5008 } ]
```

OpenClaw в том же кластере достучится по `http://superset-mcp:5008/mcp`.

### Вариант C — systemd / отдельный процесс на VM

```ini
# /etc/systemd/system/superset-mcp.service
[Service]
ExecStart=/path/to/venv/bin/superset mcp run --host 0.0.0.0 --port 5008
EnvironmentFile=/path/to/superset.env
Restart=always
```

## Шаг 3. Проверить, что MCP жив

С машины, где будет OpenClaw (важно — именно оттуда, сетевая видимость):

```bash
curl -i -X POST http://<mcp-host>:5008/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}'
```

Ждём `200 OK`. Затем `tools/list` должен вернуть ~47 инструментов.

## Шаг 4. Подключить MCP к OpenClaw

На сервере OpenClaw (по его собственной документации):

```bash
openclaw mcp set superset '{"url":"http://<mcp-host>:5008/mcp","transport":"streamable-http"}'
```

или вручную в `~/.openclaw/openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "superset": {
        "url": "http://<mcp-host>:5008/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

Если включил `MCP_API_KEY_ENABLED` — добавь токен в `headers`:

```json
"superset": {
  "url": "http://<mcp-host>:5008/mcp",
  "transport": "streamable-http",
  "headers": { "Authorization": "Bearer <api-key>" }
}
```

Перезапуск OpenClaw НЕ нужен — изменения `mcp.*` применяются на горячую.

### Откуда взять `<api-key>`

Ключ — это **API-ключ пользователя Superset** (НЕ ключ OpenClaw, НE пароль).
По умолчанию создание ключей в Superset выключено (`FAB_API_KEY_ENABLED = False`),
поэтому порядок такой:

1. На сервере Superset включить ключи (Шаг 1): `FAB_API_KEY_ENABLED = True`,
   `MCP_API_KEY_ENABLED = True`, перезапустить Superset.
2. В браузере зайти под нужным пользователем (например `admin`) и открыть профиль:
   `https://superset.techpeople.ru/profile/`
3. Создать API key. Строка начинается с `sst_...` (префикс из `FAB_API_KEY_PREFIXES`).
4. Эту строку подставить в `openclaw.json` → `headers.Authorization`:
   `"Bearer sst_..."`.

Права MCP = права этого пользователя (RBAC). Ключ `admin` видит всё; ключ
ограниченного пользователя — только разрешённое ему. Не клади admin-ключ туда,
где он может утечь — заведи отдельного сервисного пользователя с нужным минимумом.

## Разные серверы (наш случай: Superset и OpenClaw отдельно)

OpenClaw на сервере B должен дотянуться до MCP на сервере A. Два способа:

**Вариант 1 — публичный HTTPS-эндпоинт (проще, но строже к безопасности):**

- MCP за реверс-прокси с TLS, например `https://mcp.techpeople.ru/mcp`
  (или путь на основном домене). В `openclaw.json` — этот `https://`-URL.
- 🔴 Обязательно: `MCP_AUTH_ENABLED = True` + `sst_`-ключ. Без замка публичный
  MCP = полный доступ к боевому Superset из интернета.
- Только `https://` — `http://` гонит токен и данные открытым текстом.

**Вариант 2 — приватный туннель между серверами (безопаснее):**

- VPN / SSH-туннель / private network между A и B. MCP виден только серверу B,
  не всему интернету — фактически «одна сеть».
- Тогда замок можно ослабить, но включённый `MCP_AUTH_ENABLED=True` всё равно
  желателен как второй рубеж.
- Это инфраструктурная настройка (делает тот, кто администрирует серверы).

> Вывод для нашего случая: этап «потестить без ключа» недоступен — нужен либо
> публичный HTTPS + замок + ключ, либо приватный туннель. Самый безопасный
> рабочий минимум: туннель ИЛИ (публичный HTTPS + `MCP_AUTH_ENABLED=True` + `sst_`-ключ
> отдельного сервисного пользователя).

## Шаг 5. Проверка end-to-end

Спроси OpenClaw в чате что-то по данным («какие датасеты есть в Superset?»).
Он должен вызвать инструмент MCP (`list_datasets`) и ответить реальными данными
(например список из ~20 example-датасетов).

---

## Сетевой чек-лист (главный источник проблем)

- [ ] OpenClaw-хост **видит** `<mcp-host>:5008` по сети (не `localhost` — у OpenClaw
      это его собственная машина; проверено: на удалённом `localhost:5008` →
      `Connection refused`).
- [ ] Если MCP и OpenClaw в одной docker/k8s сети — используй **имя сервиса**, не localhost.
- [ ] Если `:5008` публикуется наружу — **обязательно** `MCP_AUTH_ENABLED=True` + токен.
      Иначе любой получает полный доступ к Superset через 47 инструментов.
- [ ] Ключ создан в `https://superset.techpeople.ru/profile/` (сначала
      `FAB_API_KEY_ENABLED=True`), строка `sst_...`, прописана в `openclaw.json`.
- [ ] Разные серверы → только `https://` наружу, либо приватный туннель между ними.

## Откуда взялись эти выводы

Исследование на ветке `feat/openclaw-mcp-chart`: плагин и MCP-сервер проверены
вживую (handshake, `tools/list` = 47 инструментов, `tools/call list_datasets` =
реальные данные). Единственное недостающее звено — провайдер с function-calling;
OpenClaw им быть не может, но умеет MCP-клиента — отсюда этот путь.
