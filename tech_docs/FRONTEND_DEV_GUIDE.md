# Гайд: своя разработка фронта Superset

Как вести разработку фронтенда Superset поверх стокового бэкенда, версионировать код и
автоматизировать сборку образов через GitHub Actions + DockerHub.

## Схема

- Меняем только `superset-frontend/`, бэкенд — стоковый Superset с сервера.
- Форк всего репозитория Superset (фронт не отделяется в отдельное репо — он собирается
  внутрь общего Docker-образа и отдаётся бэкендом).
- Релизный поток: git-тег → GitHub Actions собирает образ → DockerHub → сервер подтягивает.

## 1. Форк и remotes

```
upstream → https://github.com/apache/superset.git   # только pull
origin   → ваш приватный форк                         # push
```

Базируй ветку на **теге той версии, что развёрнута на сервере** (не на `master` — он
нестабилен):

```bash
docker exec <container> superset version   # узнать версию на сервере
git checkout -b company-frontend 4.1.1     # ветка от релизного тега
```

## 2. Ветки

- `master` — зеркало upstream, руками не трогаем, только синхронизируем.
- `company-frontend` — основная рабочая ветка, от неё деплоим.
- `feature/...` — фичи через PR внутрь `company-frontend`.

## 3. Версионирование

Привязка к версии upstream + свой суффикс:

```
4.1.1-acme.1 → 4.1.1-acme.2 → ...
```

Видно сразу: «база Superset 4.1.1, наша фронт-итерация 2». При апгрейде → `4.2.0-acme.1`.

**Железное правило: git-тег = docker-тег** (один в один). По образу на сервере всегда
находишь точный коммит.

## 4. GitHub Actions

Закрывает связку «тег → сборка → push», убирает рассинхрон и ручные ошибки. Образ
собирается на чистой машине ровно из того, что в git по тегу — воспроизводимо.

`.github/workflows/build.yml`:

```yaml
name: Build & push Superset image
on:
  push:
    tags: ['*-acme.*']        # реагируем только на ваши релизные теги
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "VERSION=${GITHUB_REF_NAME}" >> $GITHUB_ENV
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          build-args: BUILD_VERSION=${{ env.VERSION }}
          tags: youruser/superset:${{ env.VERSION }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- Секреты `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` → Settings → Secrets репозитория.
  Токен — access token из DockerHub с правом push, не пароль.
- Кэш (`type=gha`) обязателен — сборка фронта долгая (15–25 мин), без кэша мучительно.
- Бесплатные раннеры: 2 CPU / 7 ГБ — проходит на грани. Если упрётся в память webpack —
  добавь `NODE_OPTIONS=--max-old-space-size` или возьми раннер пожирнее.

## 5. Релизный цикл

```bash
# 1. merge фичи в company-frontend через PR
# 2. поставить тег
git tag 4.1.1-acme.3
git push origin 4.1.1-acme.3
# 3. Actions сам соберёт и запушит образ с тем же тегом
# 4. на сервере:
docker compose pull && docker compose up -d
```

В compose — **конкретный тег, не `latest`** (`latest` на проде = непонятно, что задеплоено):

```yaml
image: youruser/superset:4.1.1-acme.3
```

## 6. Версия видна из UI

В Dockerfile прокинь тег в окружение, чтобы не гадать, что задеплоено:

```dockerfile
ARG BUILD_VERSION=dev
ENV ACME_FRONTEND_VERSION=$BUILD_VERSION
```

При ручной сборке:

```bash
docker build --build-arg BUILD_VERSION=$(git describe --tags) -t youruser/superset:... .
```

## 7. Локальная разработка

- Итерации: `npm run dev` в `superset-frontend/` против API сервера (dev-сервер webpack,
  hot reload — быстро).
- Полный образ собираешь только на релиз (полная сборка долгая).

## 8. Апгрейд Superset (когда понадобится)

1. `git fetch upstream`
2. Отдельная ветка от нового релизного тега → `rebase`/`cherry-pick` своих фронт-коммитов.
3. Actions собирает → тестируешь → мержишь в `company-frontend`.
4. Новый тег `4.2.0-acme.1`.

---

## Главные правила

1. **git-тег = docker-тег** — всегда.
2. **Пинуй версию** в compose, никогда `latest` на проде.
3. **Базируйся на релизном теге** upstream, не на `master`.
4. **Кэш в CI** — иначе сборки мучительны.
5. Держи правки **только во фронте**, атомарными коммитами с префиксом (напр. `[ACME]`) —
   легче переносить при апгрейде.
