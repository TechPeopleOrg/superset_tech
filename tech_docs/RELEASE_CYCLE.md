# Шпаргалка: релизный цикл

Как выкатить новую версию фронта Superset: от фичи до образа на сервере.
Связано с [BRANCHING.md](BRANCHING.md) и [FRONTEND_DEV_GUIDE.md](FRONTEND_DEV_GUIDE.md).

## Как это работает в двух словах

```
feature/... → PR → techpeople_master → git-тег → GitHub Actions → ghcr.io → сервер
```

git-тег запускает сборку. Образ собирается на чистой машине ровно из того, что в git
по тегу, и пушится в реестр с тем же именем тега.

**Железное правило: git-тег = docker-тег.** По образу на сервере всегда находишь точный коммит.

## Версионирование

Версия upstream + наш суффикс:

```
0.0.1-techpeople.1 → 0.0.1-techpeople.2 → ...
```

Читается как «база Superset 0.0.1, наша фронт-итерация N» →
`0.0.2-techpeople.1`.

## Шаг 1. Влить фичу

Фича делается в отдельной ветке и вливается в `techpeople_master` через PR после тестов
(см. [BRANCHING.md](BRANCHING.md)).

```bash
git checkout techpeople_master
git pull origin techpeople_master      # подтянуть актуальное
```

## Шаг 2. Поставить тег

### Автоматически (рекомендуется)

```bash
cd superset-frontend
npm run release          # следующий N на текущей базе
```

Скрипт [scripts/techpeople-release.sh](../scripts/techpeople-release.sh) сам:
подтягивает теги с origin, считает следующий `N` по существующим тегам
`*-techpeople.*`, создаёт пустой коммит-маркер `[techpeople] release <тег>`,
вешает на него тег и пушит ветку и тег. Номер вести вручную больше не нужно.

```bash
npm run release 0.0.2    # поднять базовую версию (суффикс стартует с .1)
DRY_RUN=1 npm run release # показать, какой тег создастся, ничего не делая
```

Скрипт **намеренно не трогает** `package.json` / `package-lock.json`: версия
образа берётся из имени git-тега, а правка только `package.json` рассинхронит
его с `package-lock.json` и уронит `npm ci` внутри Docker-сборки. Требует
чистого рабочего дерева (всё закоммичено) — иначе остановится.

### Вручную (fallback)

```bash
git tag 0.0.1-techpeople.1
git push origin 0.0.1-techpeople.1
```

Тег должен матчить `*-techpeople.*` — иначе сборка не запустится.

## Шаг 3. Сборка идёт сама

GitHub Actions ([.github/workflows/techpeople-build.yml](../.github/workflows/techpeople-build.yml)):

- реагирует только на теги `*-techpeople.*`;
- собирает образ и пушит в `ghcr.io/techpeopleorg/superset_tech:<тег>`;
- использует встроенный `GITHUB_TOKEN` — внешних секретов не нужно;
- кэширует сборку (фронт собирается 15–25 мин).

Следить за прогрессом: вкладка **Actions** в репозитории на GitHub.

## Шаг 4. Выкатить на сервер

Сначала логинимся в ghcr.io (разово на сервере). Логин — GitHub-ник, пароль —
Personal Access Token (classic) со scope `read:packages`:

```bash
echo <ТВОЙ_ТОКЕН> | docker login ghcr.io -u <твой-github-логин> --password-stdin
```

`--password-stdin` берёт токен из потока, а не из аргумента, чтобы он не попал в
историю команд. Где взять токен: GitHub → Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate, scope `read:packages`.

Затем выкатываем:

```bash
docker compose pull
docker compose up -d
```

В `docker-compose` на сервере — **конкретный тег, не `latest`** (`latest` на проде =
непонятно, что задеплоено):

```yaml
image: ghcr.io/techpeopleorg/superset_tech:0.0.1-techpeople.1
```

При выкате новой версии меняешь тег в compose и повторяешь Шаг 4.

### Откуда берётся имя образа

Имя не выдумывается — оно складывается из трёх частей:

```
ghcr.io / techpeopleorg / superset_tech : 0.0.1-techpeople.1
└─реестр─┘ └──владелец──┘ └─имя пакета──┘ └──────тег───────┘
```

| Часть | Откуда берётся |
| --- | --- |
| `ghcr.io` | реестр (фиксирован — мы используем GitHub Container Registry) |
| `techpeopleorg` | организация из URL репозитория, в нижнем регистре (`github.com/TechPeopleOrg/...`) |
| `superset_tech` | имя репозитория (в workflow задаётся как `IMAGE_NAME=${GITHUB_REPOSITORY,,}`) |
| тег | git-тег, который ты сам поставил (правило: git-тег = docker-тег) |

Три способа узнать готовое имя для `docker pull`, от простого к ручному:

1. **GitHub → Packages** (`github.com/orgs/TechPeopleOrg/packages` → пакет `superset_tech`) —
   показывает готовую строку `docker pull ...` и список всех доступных тегов. Самый надёжный
   способ, особенно на сервере, где образа ещё нет локально.
2. **`docker images "ghcr.io/techpeopleorg/*"`** — если образ уже скачан, колонки
   `Repository:Tag` и есть имя для pull.
3. **Собрать вручную**: `ghcr.io` / организация (lowercase) / репозиторий / твой тег.

## Проверить, что задеплоено

Версия зашита в образ (`BUILD_VERSION` → `TECHPEOPLE_FRONTEND_VERSION`):

```bash
docker exec <container> printenv TECHPEOPLE_FRONTEND_VERSION
```

## Разовая настройка на GitHub (перед первым тегом)

1. **Settings → Actions → General → Workflow permissions** → «Read and write permissions»
   (иначе push в ghcr.io упадёт по правам).
2. После первой сборки пакет в ghcr.io приватный — это норм. Если сервер не тянет образ,
   выдай токену доступ к пакету: **Package settings → Manage Actions access**.

## Чек-лист релиза

1. [ ] Фича влита в `techpeople_master` через PR, тесты зелёные.
2. [ ] `git pull` — ветка актуальна.
3. [ ] Поставлен тег `X.Y.Z-techpeople.N` и запушен (`npm run release`).
4. [ ] Actions собрал образ (вкладка Actions — зелёный).
5. [ ] В compose на сервере прописан этот тег (не `latest`).
6. [ ] `docker compose pull && up -d`.
7. [ ] Проверена версия: `printenv TECHPEOPLE_FRONTEND_VERSION`.
