# Dashboard CSS MCP tools — design

**Дата:** 2026-07-17
**Статус:** Draft (на ревью)

## Контекст и цель

В Superset есть MCP-сервис (`superset/mcp_service/`), через который LLM работает с
дашбордами, чартами, датасетами. Виджет-чат **OpenClawAI** (плагин
`superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAI`) уже подключён к MCP:
пользователь пишет в чат, MCP-цикл (вызов тулз) крутится на стороне сервера OpenClaw,
браузер получает только финальный текстовый ответ.

Сценарий, который надо поддержать: пользователь в чате говорит
«сделай дашборд „Продажи“ красным» или «виджет „Выручка“ отодвинь влево» — и LLM
через MCP-тулзы редактирует поле `css` соответствующего дашборда.

**В модуле `dashboard/` пока нет тулз для чтения/записи `css`.** Путь записи готов:
`UpdateDashboardCommand` принимает поле `css`, а в `superset/dashboards/schemas.py`
есть `validate_css` (тот же валидатор, что использует REST API).

## Scope

Эта итерация — **только бэкенд (MCP-тулзы)**. Пользователь видит результат после
обновления страницы дашборда. Живое применение CSS без reload — отдельная будущая
итерация (отложено, т.к. в OpenClawAI MCP-цикл идёт на сервере и браузер не видит
результат тулзы).

### Вне scope (YAGNI)
- Фронтенд / живое применение CSS без reload.
- Патч CSS по regex/произвольному селектору руками.
- Скриншот-превью отрендеренного CSS.
- CSS-шаблоны / библиотека готовых тем.
- Real-time push изменений в открытые вкладки других пользователей.

## Тулзы

Все тулзы работают по параметру `identifier`, который принимает числовой ID, UUID,
slug **или человекочитаемое название** дашборда (фаззи-резолв). Все — в
`superset/mcp_service/dashboard/tool/`, регистрируются через `@tool` и импорт в `app.py`.

### 1. `get_dashboard_css` (read-only)

- **Вход:** `identifier`.
- **Выход:**
  - `id`, `dashboard_title`
  - `css` — текущий полный CSS
  - `css_length`
  - `blocks` — список имён mcp-блоков, найденных в CSS
  - `widgets` — список `{ slice_name, selector }` (название виджета → CSS-селектор),
    извлекается из `position_json`; даёт LLM понимание, к чему он может целиться
- **Аннотации:** `readOnlyHint=True`, `destructiveHint=False`, `class_permission_name="Dashboard"`.

### 2. `set_dashboard_css` (mutate — полная замена)

- **Вход:** `identifier`, `css` (полный новый стиль).
- **Поведение:** `validate_css` + лимит размера → `UpdateDashboardCommand(id, {"css": css})`.
- **Выход:** `id`, `dashboard_title`, `css`, `css_length`, `changed: bool`.
- **Аннотации:** `readOnlyHint=False`, `destructiveHint=False`, `method_permission_name="write"`.

### 3. `upsert_dashboard_css_block` (mutate — идемпотентный блок)

Для глобальных стилей уровня дашборда (фон, шрифты).

- **Вход:** `identifier`, `block_name` (slug), `css` (фрагмент для блока).
- **Поведение:**
  - Фрагмент оборачивается в маркеры:
    ```
    /* mcp:block:BLOCK_NAME:start */
    ...фрагмент...
    /* mcp:block:BLOCK_NAME:end */
    ```
  - Если блок с таким `block_name` уже есть — заменяется; иначе — дописывается в конец.
  - Всё вне mcp-маркеров (ручной CSS, другие блоки) не трогается.
  - Пустой `css` → блок удаляется (сброс/откат).
  - `validate_css` + лимит размера применяются к **итоговому** документу целиком.
  - Запись через `UpdateDashboardCommand`.
- **Выход:** `id`, `block_name`, `action` (`created` | `updated` | `removed`), `css`, `css_length`.

### 4. `style_dashboard_widget` (mutate — стили конкретного виджета)

- **Вход:** `identifier`, `widget_name` (название виджета/чарта), `styles` (**сырой CSS-текст**
  свойств, напр. `"margin-left: 40px; background: blue;"`).
- **Поведение:**
  - Резолв виджета: читать `position_json`, фаззи-матч по `slice_name`. Если несколько
    совпадений — вернуть кандидатов (см. «Неоднозначность»).
  - Построить правило через `build_widget_rule` — умный выбор уровня селектора по типу
    свойств (фон/рамка → внутренняя плитка; отступы/сдвиг → внешний `#CHART-<key>`;
    см. `widget_selectors.py`).
  - Записать правило как именованный блок
    `widget:<нормализованное_название>` через ту же механику, что и
    `upsert_dashboard_css_block`.
  - Пустые `styles` → блок виджета удаляется.
  - `validate_css` + лимит размера на итоговый документ. Запись через `UpdateDashboardCommand`.
- **Выход:** `id`, `widget_name`, `selector`, `action`, `css`, `css_length`.

## Общие внутренние компоненты (изолированные юниты)

### `dashboard/css_blocks.py` — чистые операции над блоками
Только работа со строками, тестируется без БД.
- `find_blocks(css) -> list[str]` — имена всех mcp-блоков.
- `upsert_block(css, name, fragment) -> tuple[str, str]` — вернуть `(new_css, action)`,
  где action ∈ `created|updated|removed` (пустой fragment → removed).
- `MARKER_START` / `MARKER_END` шаблоны и парсер маркеров.

### `dashboard/widget_selectors.py` — резолв виджета в селектор

**Как виджет адресуется в DOM (проверено по коду):** каждый чарт в `position_json`
имеет ключ `CHART-<key>`, который рендерится как `id` внешнего контейнера
(`ChartHolder` → `<div id="CHART-<key>">`). Внутри — вложенные обёртки:

```
#CHART-<key>                              (внешний контейнер, из position_json — надёжный якорь)
  └─ Resizable / .dashboard-component-chart-holder
       └─ .chart-slice [data-test-chart-name] [data-test-viz-type] [data-test-chart-id]
            └─ .dashboard-chart            (внутренняя «плитка» — фон/рамка визуально здесь)
                 └─ echarts-контейнер (генерируемые классы — НЕ адресуем)
```

Важное следствие из вложенности:
- LLM **никогда не пишет селектор сам** — он даёт только `widget_name` + `styles`.
  Тулза строит селектор из гарантированных якорей `position_json`.
- Внутренности echarts (оси, лейблы, ячейки) — генерируемые классы, **вне scope**:
  адресуем только контейнеры чарта, не их содержимое.

**Умный выбор уровня по типу свойства** (`build_widget_rule`):
- Свойства фона/рамки/тени/скругления (`background`, `border`, `box-shadow`,
  `border-radius`, ...) → `#CHART-<key> .dashboard-chart { ... }` — красит внутреннюю
  плитку, не задевая grid-раскладку.
- Свойства отступов/сдвига (`margin`, `padding`, `transform`, `opacity`, ...) →
  `#CHART-<key> { ... }` — внешний контейнер.
- Прочее по умолчанию → внешний `#CHART-<key>`.
- Разбор идёт по именам свойств из `styles`; при смешанном наборе правило может
  разбиваться на два (внешний + внутренний селектор).

API:
- `resolve_widget(position_json, widget_name) -> WidgetMatch | list[Candidate]` —
  фаззи-матч по `slice_name`/`meta.sliceName`; при неоднозначности — список кандидатов.
- `build_widget_rule(match, styles) -> str` — вернуть готовый(е) CSS-блок(и) с
  правильным уровнем селектора.
- `list_widgets(position_json) -> list[{slice_name, chart_key, selector}]` —
  для `get_dashboard_css` (selector = внешний `#CHART-<key>`).

### `dashboard/schemas.py` — Pydantic-схемы
Новые: `GetDashboardCssRequest/Response`, `SetDashboardCssRequest/Response`,
`UpsertDashboardCssBlockRequest/Response`, `StyleDashboardWidgetRequest/Response`,
`DashboardCssError`, `AmbiguousDashboardResponse`. Union-синтаксис Python 3.10+.

### Резолв дашборда по `identifier`
Переиспользовать существующую логику резолва (id/uuid/slug) из `ModelGetInfoCore` /
`DashboardDAO`, расширив резолвом по названию через `list_dashboards`-подобный поиск.

**Как LLM указывает дашборд (бэкенд-only):** пользователь называет дашборд явно во
фразе — «Дашборд FDD, виджет Выручка — ...». LLM извлекает название и передаёт его как
`identifier`. Этого достаточно для всех сценариев без фронтенд-правок.

Случай «этот дашборд» / «тут» (без явного названия) в этой итерации **не
поддерживается** — для него чат должен знать свой текущий `dashboardId`, что требует
отдельной фронтенд-правки (достать id из URL/стора и вписать в системный промпт).
Вынесено в опциональное будущее расширение, не входит в scope.

## Ключевые решения по поведению

- **Неоднозначность / отсутствие дашборда по названию:** не писать. Вернуть
  `{ ambiguous: true, candidates: [{id, title}] }`, чтобы LLM переспросил у пользователя.
  Аналогично для неоднозначного `widget_name`.
- **Безопасность:** полагаемся на штатный RBAC — `UpdateDashboardCommand` проверяет права
  на редактирование дашборда. Нет прав → штатная ошибка. Никаких доп. подтверждений.
- **Валидация:** `validate_css` из `superset/dashboards/schemas.py` (тот же, что REST API) +
  мягкий лимит размера (константа, напр. 256 КБ) на итоговый документ. Ошибку
  `ValidationError` заворачивать в структурированный `DashboardCssError`, понятный LLM.
- **Откат/сброс:** удаление именованного блока (пустой css) или всех mcp-блоков.

## Регистрация (по конвенции `mcp_service/CLAUDE.md`)
- Экспорт четырёх тулз из `dashboard/tool/__init__.py`.
- Импорты в `app.py` внизу (после `initialize_core_mcp_dependencies()`).
- Обновить `DEFAULT_INSTRUCTIONS` в `app.py`: упомянуть редактирование CSS дашборда/виджетов.
- ASF-лицензионный заголовок во всех новых `.py`.

## Тестирование
- **Чистые unit-тесты** `css_blocks.py`: create/update/remove, идемпотентность, сохранность
  чужого (не-mcp) CSS, несколько блоков.
- **Чистые unit-тесты** `widget_selectors.py`: точный матч, фаззи-матч, неоднозначность,
  генерация селектора, `list_widgets`.
- **Async-тесты тулз** (`tests/unit_tests/mcp_service/dashboard/tool/`), моки
  `DashboardDAO.find_by_id` и `UpdateDashboardCommand`:
  - `get_dashboard_css` — чтение, список блоков и виджетов.
  - `set_dashboard_css` — полная замена; отказ `validate_css`; отказ по лимиту размера.
  - `upsert_dashboard_css_block` — created / updated / removed; сохранность чужого CSS.
  - `style_dashboard_widget` — применение стиля; резолв по названию; неоднозначность
    (candidates); удаление блока виджета.
  - Резолв по названию: несколько совпадений → `ambiguous`.

## Открытые вопросы для плана
- Точное значение лимита размера CSS (256 КБ как стартовая гипотеза).
- Пороги/алгоритм фаззи-матча по названию (точное вхождение → регистронезависимое →
  расстояние Левенштейна?) и порог, при котором считаем результат неоднозначным.
