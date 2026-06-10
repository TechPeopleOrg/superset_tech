# Шпаргалка: получение свежих обновлений Superset (upstream)

Как тянуть обновления оригинального Apache Superset в наш форк.

## Модель remotes

```
origin   → github.com/TechPeopleOrg/superset_tech   ← НАШ форк (сюда пушим)
upstream → github.com/apache/superset               ← ОРИГИНАЛ (отсюда только читаем)
```

- `origin` — наш, в него пишем (push).
- `upstream` — Apache, из него только читаем (fetch/pull). Push туда отключён.

## Разовая настройка (если upstream ещё не подключён)

```bash
git remote add upstream https://github.com/apache/superset.git
git remote set-url --push upstream DISABLE   # защита от случайного push в Apache
git fetch upstream --tags
```

Проверить: `git remote -v` — у upstream push должен быть `DISABLE`.

## Основная команда — fetch (безопасно, ничего не меняет)

```bash
git fetch upstream
```

`fetch` только **скачивает** новые коммиты и теги, твои ветки не трогает. Делать можно
когда угодно — ничего не сломает. После него появляются read-only ветки `upstream/master`,
`upstream/4.1`, … и теги `vX.Y.Z`.

## Сценарий A — обновить наш `master` (зеркало upstream)

`master` у нас = ветка для актуальных обновлений (см. [BRANCHING.md](BRANCHING.md)).

```bash
git checkout master
git fetch upstream
git merge upstream/master      # влить свежак Apache в наш master
git push origin master         # отправить обновлённый master в наш форк
```

После этого `master` = актуальный Apache Superset.

## Сценарий B — апгрейд рабочей ветки до новой версии (осознанно, не каждый день)

Поднять версию Superset под `techpeople_master`. Операция тяжёлая (возможны конфликты),
делается отдельно и тестируется. Подробно — раздел 8 в
[FRONTEND_DEV_GUIDE.md](FRONTEND_DEV_GUIDE.md).

```bash
git fetch upstream --tags
git checkout -b upgrade/4.2.0 v4.2.0          # ветка от нового релизного тега
git cherry-pick <наши коммиты>                # перенести наши фронт-правки
# собрать образ через Actions → протестировать → влить в techpeople_master
```

## Полезные команды

| Что хочешь | Команда |
|---|---|
| Скачать обновления Apache (безопасно) | `git fetch upstream` |
| Посмотреть доступные версии | `git tag` / `git branch -r \| grep upstream` |
| Обновить наш `master` до актуального | см. Сценарий A |
| Узнать текущую версию | `git describe --tags` |

## Три правила

1. **`fetch` безопасен всегда** — только скачивает, ничего не ломает.
2. **В `upstream` не пушим** — только читаем (push отключён через `DISABLE`).
3. **`master` синхронизируем с upstream, работаем в `techpeople_master`.** Обновления
   Apache вливаем в основную ветку осознанно (апгрейд, Сценарий B), а не автоматически.
