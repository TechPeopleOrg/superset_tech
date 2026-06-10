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
4.1.1-techpeople.1 → 4.1.1-techpeople.2 → ...
```

Читается как «база Superset 4.1.1, наша фронт-итерация N». При апгрейде Superset →
`4.2.0-techpeople.1`.

## Шаг 1. Влить фичу

Фича делается в отдельной ветке и вливается в `techpeople_master` через PR после тестов
(см. [BRANCHING.md](BRANCHING.md)).

```bash
git checkout techpeople_master
git pull origin techpeople_master      # подтянуть актуальное
```

## Шаг 2. Поставить тег

```bash
git tag 4.1.1-techpeople.1
git push origin 4.1.1-techpeople.1
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

```bash
docker login ghcr.io              # тем же GitHub-токеном (разово)
docker compose pull
docker compose up -d
```

В `docker-compose` на сервере — **конкретный тег, не `latest`** (`latest` на проде =
непонятно, что задеплоено):

```yaml
image: ghcr.io/techpeopleorg/superset_tech:4.1.1-techpeople.1
```

При выкате новой версии меняешь тег в compose и повторяешь Шаг 4.

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
3. [ ] Поставлен тег `X.Y.Z-techpeople.N` и запушен.
4. [ ] Actions собрал образ (вкладка Actions — зелёный).
5. [ ] В compose на сервере прописан этот тег (не `latest`).
6. [ ] `docker compose pull && up -d`.
7. [ ] Проверена версия: `printenv TECHPEOPLE_FRONTEND_VERSION`.
