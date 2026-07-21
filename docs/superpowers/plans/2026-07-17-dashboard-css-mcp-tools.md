# Dashboard CSS MCP tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать LLM через MCP четыре тулзы для чтения и безопасной правки поля `css` дашборда (глобально и по конкретному виджету по названию).

**Architecture:** Две чистые библиотеки без БД (`css_blocks.py` — идемпотентные именованные блоки в CSS; `widget_selectors.py` — резолв виджета из `position_json` в CSS-селектор) плюс общий модуль записи (`css_write.py` — резолв дашборда + RBAC + `validate_css` + лимит размера + `UpdateDashboardCommand`). Поверх них — 4 тонкие MCP-тулзы. Всё в существующем модуле `superset/mcp_service/dashboard/`.

**Tech Stack:** Python 3.10+, FastMCP, Pydantic v2, SQLAlchemy (через Superset DAO/Command), pytest + `fastmcp.Client`.

## Global Constraints

- ASF-лицензионный заголовок обязателен в КАЖДОМ новом `.py` (шаблон — см. `superset/mcp_service/CLAUDE.md`).
- Union-синтаксис Python 3.10+: `str | None`, `list[str]`, `dict[str, Any]` — НЕ `Optional`/`List`/`Dict`.
- Тулзы регистрируются импортом в `superset/mcp_service/app.py` внизу (после `initialize_core_mcp_dependencies()`), НЕ в `server.py`.
- Каждая тулза: `@tool(...)` из `superset_core.mcp.decorators` с `ToolAnnotations(title=..., readOnlyHint=..., destructiveHint=...)`, `class_permission_name="Dashboard"`.
- Мутирующие тулзы: `tags=["mutate"]`; read-only: `tags=["discovery"]`.
- Использовать DAO (`DashboardDAO.find_by_id`) и `UpdateDashboardCommand`, НЕ прямые запросы к БД.
- Все входы/выходы — Pydantic-модели в `dashboard/schemas.py`.
- `event_logger.log_context(action="mcp.<tool>.<step>")` вокруг ключевых операций; `await ctx.info/warning/error(...)` для логов.
- Тесты запускаются в Docker-образе (host не имеет зависимостей): `docker compose ... superset_tech-superset` — см. «Запуск тестов» ниже.
- Лимит размера CSS: `MAX_DASHBOARD_CSS_BYTES = 256 * 1024` (256 КБ), применяется к ИТОГОВОМУ документу.
- Формат маркеров блока (verbatim):
  `/* mcp:block:<NAME>:start */` … `/* mcp:block:<NAME>:end */`
- Селектор виджета строится из ключа компонента `position_json` (`CHART-<key>` = `node_id`), НЕ из названия. Умный уровень: фон/рамка/тень/скругление → `#<CHART-key> .dashboard-chart`; отступы/сдвиг/прочее → `#<CHART-key>`.

## Запуск тестов

Host не имеет superset-зависимостей. Тесты запускаются через `docker run` с образом
`superset_tech-superset`, монтируя `superset/` и `tests/` целиком (ради свежего кода и
conftest-фикстур), из `/app`. Запускать из каталога `superset_tech/`:

```bash
docker run --rm --entrypoint pytest -w /app \
  -v "$(pwd)/superset":/app/superset:ro \
  -v "$(pwd)/tests":/app/tests:ro \
  superset_tech-superset \
  <TEST_PATH> -p no:cacheprovider -q
```

где `<TEST_PATH>` — путь к тест-файлу или подпапке (напр.
`tests/unit_tests/mcp_service/dashboard/test_css_blocks.py`). Ниже в задачах эта
команда сокращается до `run-tests <TEST_PATH>` — подставляйте полную форму.

ВАЖНО: монтируем `superset/` и `tests/` ЦЕЛИКОМ, не отдельные файлы (иначе теряются
autouse-фикстуры из `tests/unit_tests/conftest.py` → `App not initialized`). Правки на
host видны сразу — том монтируется ro при каждом запуске. Проверено: существующая
подпапка `tests/unit_tests/mcp_service/dashboard/` = 141 passed за ~8с.

ВАЖНО (auth): любой тест, вызывающий тулзу через `fastmcp.Client`, ОБЯЗАН включать
autouse-фикстуру `mock_auth`, иначе `MCPNoAuthSourceError: Authentication required`.
Добавлять в КАЖДЫЙ тул-тест (Tasks 5–8):
```python
from unittest.mock import Mock, patch
import pytest

@pytest.fixture(autouse=True)
def mock_auth():
    with patch("superset.mcp_service.auth.get_user_from_request") as m:
        u = Mock(); u.id = 1; u.username = "admin"
        m.return_value = u
        yield m
```

---

## Файловая структура

**Создать:**
- `superset/mcp_service/dashboard/css_blocks.py` — чистые операции над именованными блоками CSS.
- `superset/mcp_service/dashboard/widget_selectors.py` — резолв виджета из `position_json` → селектор.
- `superset/mcp_service/dashboard/css_write.py` — общий путь записи: резолв дашборда + RBAC + валидация + команда.
- `superset/mcp_service/dashboard/tool/get_dashboard_css.py`
- `superset/mcp_service/dashboard/tool/set_dashboard_css.py`
- `superset/mcp_service/dashboard/tool/upsert_dashboard_css_block.py`
- `superset/mcp_service/dashboard/tool/style_dashboard_widget.py`
- Тесты (зеркалят структуру): `tests/unit_tests/mcp_service/dashboard/test_css_blocks.py`, `test_widget_selectors.py`, и `tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py`, `test_set_dashboard_css.py`, `test_upsert_dashboard_css_block.py`, `test_style_dashboard_widget.py`.

**Изменить:**
- `superset/mcp_service/dashboard/schemas.py` — добавить Pydantic-схемы запросов/ответов/ошибок для CSS-тулз.
- `superset/mcp_service/dashboard/tool/__init__.py` — экспорт 4 тулз.
- `superset/mcp_service/app.py` — импорт 4 тулз внизу; дополнить `DEFAULT_INSTRUCTIONS`.

---

## Task 1: `css_blocks.py` — чистые операции над именованными блоками

**Files:**
- Create: `superset/mcp_service/dashboard/css_blocks.py`
- Test: `tests/unit_tests/mcp_service/dashboard/test_css_blocks.py`

**Interfaces:**
- Consumes: ничего (чистые строки).
- Produces:
  - `MARKER_START_TMPL = "/* mcp:block:{name}:start */"`, `MARKER_END_TMPL = "/* mcp:block:{name}:end */"`
  - `find_blocks(css: str | None) -> list[str]` — имена всех mcp-блоков в порядке появления.
  - `upsert_block(css: str | None, name: str, fragment: str) -> tuple[str, str]` — вернуть `(new_css, action)`, `action ∈ {"created","updated","removed"}`. Пустой/пробельный `fragment` → блок удаляется (`removed`; если блока не было — `new_css` без изменений, action `removed`).
  - `remove_all_blocks(css: str | None) -> str` — вырезать все mcp-блоки.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/test_css_blocks.py
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from superset.mcp_service.dashboard.css_blocks import (
    find_blocks,
    remove_all_blocks,
    upsert_block,
)


def test_upsert_creates_block_and_preserves_foreign_css():
    css = ".dashboard { color: black; }"
    new_css, action = upsert_block(css, "background", ".dashboard { background: red; }")
    assert action == "created"
    # foreign CSS untouched
    assert ".dashboard { color: black; }" in new_css
    # block wrapped in markers
    assert "/* mcp:block:background:start */" in new_css
    assert "/* mcp:block:background:end */" in new_css
    assert ".dashboard { background: red; }" in new_css


def test_upsert_updates_existing_block_no_duplicate():
    css, _ = upsert_block("", "background", "a { background: red; }")
    new_css, action = upsert_block(css, "background", "a { background: blue; }")
    assert action == "updated"
    assert new_css.count("/* mcp:block:background:start */") == 1
    assert "blue" in new_css
    assert "red" not in new_css


def test_empty_fragment_removes_block():
    css, _ = upsert_block("", "background", "a { background: red; }")
    new_css, action = upsert_block(css, "background", "   ")
    assert action == "removed"
    assert "mcp:block:background" not in new_css


def test_find_blocks_lists_names_in_order():
    css, _ = upsert_block("", "first", "a {}")
    css, _ = upsert_block(css, "second", "b {}")
    assert find_blocks(css) == ["first", "second"]


def test_remove_all_blocks_keeps_manual_css():
    manual = ".manual { color: green; }"
    css, _ = upsert_block(manual, "one", "a {}")
    css, _ = upsert_block(css, "two", "b {}")
    result = remove_all_blocks(css)
    assert "mcp:block" not in result
    assert ".manual { color: green; }" in result


def test_find_blocks_on_none_returns_empty():
    assert find_blocks(None) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_blocks.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'superset.mcp_service.dashboard.css_blocks'`.

- [ ] **Step 3: Write minimal implementation**

```python
# superset/mcp_service/dashboard/css_blocks.py
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Pure string operations for named MCP CSS blocks.

An MCP block is a fragment of CSS wrapped in comment markers so that MCP
tools can update or remove *their own* additions idempotently without
touching hand-written CSS or other blocks.
"""

import re

MARKER_START_TMPL = "/* mcp:block:{name}:start */"
MARKER_END_TMPL = "/* mcp:block:{name}:end */"

# Match a whole block (markers + body) for a given, already-escaped name.
_BLOCK_RE_TMPL = (
    r"[ \t]*/\* mcp:block:{name}:start \*/.*?"
    r"/\* mcp:block:{name}:end \*/[ \t]*\n?"
)
# Capture block names from any start marker.
_ANY_BLOCK_NAME_RE = re.compile(r"/\* mcp:block:(?P<name>.+?):start \*/")


def _block_re(name: str) -> "re.Pattern[str]":
    return re.compile(
        _BLOCK_RE_TMPL.format(name=re.escape(name)),
        re.DOTALL,
    )


def find_blocks(css: str | None) -> list[str]:
    """Return names of all MCP blocks, in order of appearance."""
    if not css:
        return []
    return _ANY_BLOCK_NAME_RE.findall(css)


def upsert_block(css: str | None, name: str, fragment: str) -> tuple[str, str]:
    """Insert, replace, or remove a named MCP block.

    Empty/whitespace ``fragment`` removes the block. Returns
    ``(new_css, action)`` where action is created|updated|removed.
    """
    base = css or ""
    exists = bool(_block_re(name).search(base))

    if not fragment or not fragment.strip():
        new_css = _block_re(name).sub("", base) if exists else base
        return new_css.rstrip() + ("\n" if new_css.strip() else ""), "removed"

    block = (
        f"{MARKER_START_TMPL.format(name=name)}\n"
        f"{fragment.strip()}\n"
        f"{MARKER_END_TMPL.format(name=name)}\n"
    )

    if exists:
        new_css = _block_re(name).sub(block, base)
        return new_css, "updated"

    prefix = base.rstrip()
    joined = f"{prefix}\n\n{block}" if prefix else block
    return joined, "created"


def remove_all_blocks(css: str | None) -> str:
    """Remove every MCP block, leaving foreign CSS intact."""
    base = css or ""
    for name in find_blocks(base):
        base = _block_re(name).sub("", base)
    return base.rstrip() + ("\n" if base.strip() else "")
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_blocks.py -v
```
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add superset/mcp_service/dashboard/css_blocks.py \
        tests/unit_tests/mcp_service/dashboard/test_css_blocks.py
git commit -m "feat(mcp): add pure named-CSS-block helpers for dashboard css"
```

---

## Task 2: `widget_selectors.py` — резолв виджета из position_json в селектор

**Files:**
- Create: `superset/mcp_service/dashboard/widget_selectors.py`
- Test: `tests/unit_tests/mcp_service/dashboard/test_widget_selectors.py`

**Interfaces:**
- Consumes: ничего (чистые функции над dict/строками).
- Produces:
  - `WidgetMatch` (dataclass): `chart_key: str`, `slice_name: str`, `chart_id: int | None`.
  - `WidgetCandidate` (dataclass): `chart_key: str`, `slice_name: str`.
  - `list_widgets(position: dict) -> list[WidgetCandidate]` — все чарты (`type == "CHART"`) c ключом `CHART-<key>` и названием (`sliceNameOverride`/`sliceName`).
  - `resolve_widget(position: dict, widget_name: str) -> tuple[WidgetMatch | None, list[WidgetCandidate]]` — `(match, candidates)`: точный/уникальный частичный матч → `(match, [])`; неоднозначно → `(None, candidates)`; не найдено → `(None, [])`.
  - `outer_selector(chart_key: str) -> str` → `"#<chart_key>"`.
  - `inner_selector(chart_key: str) -> str` → `"#<chart_key> .dashboard-chart"`.
  - `build_widget_rule(chart_key: str, styles: str) -> str` — CSS-правило(а), уровень выбирается по именам свойств в `styles`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/test_widget_selectors.py
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from superset.mcp_service.dashboard.widget_selectors import (
    build_widget_rule,
    list_widgets,
    resolve_widget,
)

POSITION = {
    "ROOT_ID": {"type": "ROOT", "children": ["CHART-aaa", "CHART-bbb"]},
    "CHART-aaa": {"type": "CHART", "meta": {"sliceName": "Выручка", "chartId": 10}},
    "CHART-bbb": {"type": "CHART", "meta": {"sliceName": "Заказы", "chartId": 11}},
}


def test_list_widgets_returns_all_charts():
    widgets = list_widgets(POSITION)
    names = {w.slice_name for w in widgets}
    keys = {w.chart_key for w in widgets}
    assert names == {"Выручка", "Заказы"}
    assert keys == {"CHART-aaa", "CHART-bbb"}


def test_resolve_exact_match():
    match, candidates = resolve_widget(POSITION, "Выручка")
    assert candidates == []
    assert match is not None
    assert match.chart_key == "CHART-aaa"
    assert match.chart_id == 10


def test_resolve_case_insensitive_partial():
    match, candidates = resolve_widget(POSITION, "выруч")
    assert match is not None
    assert match.chart_key == "CHART-aaa"


def test_resolve_ambiguous_returns_candidates():
    position = {
        "ROOT_ID": {"type": "ROOT", "children": ["CHART-1", "CHART-2"]},
        "CHART-1": {"type": "CHART", "meta": {"sliceName": "Продажи РФ"}},
        "CHART-2": {"type": "CHART", "meta": {"sliceName": "Продажи ЕС"}},
    }
    match, candidates = resolve_widget(position, "Продажи")
    assert match is None
    assert {c.slice_name for c in candidates} == {"Продажи РФ", "Продажи ЕС"}


def test_resolve_not_found():
    match, candidates = resolve_widget(POSITION, "Нет такого")
    assert match is None
    assert candidates == []


def test_build_rule_background_targets_inner():
    rule = build_widget_rule("CHART-aaa", "background: red;")
    assert "#CHART-aaa .dashboard-chart" in rule
    assert "background: red;" in rule


def test_build_rule_margin_targets_outer():
    rule = build_widget_rule("CHART-aaa", "margin-left: -40px;")
    assert "#CHART-aaa {" in rule
    assert ".dashboard-chart" not in rule


def test_build_rule_mixed_splits_levels():
    rule = build_widget_rule("CHART-aaa", "margin-left: 10px; background: red;")
    assert "#CHART-aaa .dashboard-chart" in rule  # background -> inner
    assert "#CHART-aaa {" in rule  # margin -> outer
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_widget_selectors.py -v
```
Expected: FAIL — `ModuleNotFoundError: ... widget_selectors`.

- [ ] **Step 3: Write minimal implementation**

```python
# superset/mcp_service/dashboard/widget_selectors.py
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Resolve a dashboard widget (chart) by name into a stable CSS selector.

Chart containers render with ``id="CHART-<key>"`` where ``CHART-<key>`` is the
component key in ``position_json``. That id is the reliable anchor: names are
only used to *find* the widget, never to build the selector.
"""

from dataclasses import dataclass

# Property-name prefixes that should target the inner tile (visual surface)
# rather than the outer grid container.
_INNER_PROPERTY_PREFIXES = (
    "background",
    "border",
    "box-shadow",
    "border-radius",
    "color",
    "outline",
)


@dataclass
class WidgetMatch:
    chart_key: str
    slice_name: str
    chart_id: int | None


@dataclass
class WidgetCandidate:
    chart_key: str
    slice_name: str


def list_widgets(position: dict) -> list[WidgetCandidate]:
    """Return all chart components as candidates."""
    widgets: list[WidgetCandidate] = []
    for node_id, node in position.items():
        if not isinstance(node, dict) or node.get("type") != "CHART":
            continue
        meta = node.get("meta") if isinstance(node.get("meta"), dict) else {}
        name = meta.get("sliceNameOverride") or meta.get("sliceName") or ""
        widgets.append(WidgetCandidate(chart_key=node_id, slice_name=name))
    return widgets


def _to_match(position: dict, candidate: WidgetCandidate) -> WidgetMatch:
    meta = position[candidate.chart_key].get("meta") or {}
    raw_id = meta.get("chartId")
    return WidgetMatch(
        chart_key=candidate.chart_key,
        slice_name=candidate.slice_name,
        chart_id=raw_id if isinstance(raw_id, int) else None,
    )


def resolve_widget(
    position: dict, widget_name: str
) -> tuple[WidgetMatch | None, list[WidgetCandidate]]:
    """Resolve a widget by name.

    Returns (match, candidates). Exact or unique case-insensitive substring
    match -> (match, []). Multiple matches -> (None, candidates). None -> (None, []).
    """
    widgets = list_widgets(position)
    target = widget_name.strip().casefold()

    exact = [w for w in widgets if w.slice_name.casefold() == target]
    if len(exact) == 1:
        return _to_match(position, exact[0]), []
    if len(exact) > 1:
        return None, exact

    partial = [w for w in widgets if target in w.slice_name.casefold()]
    if len(partial) == 1:
        return _to_match(position, partial[0]), []
    if len(partial) > 1:
        return None, partial

    return None, []


def outer_selector(chart_key: str) -> str:
    return f"#{chart_key}"


def inner_selector(chart_key: str) -> str:
    return f"#{chart_key} .dashboard-chart"


def _split_declarations(styles: str) -> list[tuple[str, str]]:
    """Parse "prop: val; prop2: val2" into [(prop, 'prop: val'), ...]."""
    out: list[tuple[str, str]] = []
    for decl in styles.split(";"):
        decl = decl.strip()
        if not decl or ":" not in decl:
            continue
        prop = decl.split(":", 1)[0].strip().casefold()
        out.append((prop, decl))
    return out


def _is_inner(prop: str) -> bool:
    return any(prop.startswith(p) for p in _INNER_PROPERTY_PREFIXES)


def build_widget_rule(chart_key: str, styles: str) -> str:
    """Build CSS rule(s), choosing selector level per property type."""
    inner_decls = [d for p, d in _split_declarations(styles) if _is_inner(p)]
    outer_decls = [d for p, d in _split_declarations(styles) if not _is_inner(p)]

    rules: list[str] = []
    if outer_decls:
        rules.append(f"{outer_selector(chart_key)} {{ {'; '.join(outer_decls)}; }}")
    if inner_decls:
        rules.append(f"{inner_selector(chart_key)} {{ {'; '.join(inner_decls)}; }}")
    return "\n".join(rules)
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_widget_selectors.py -v
```
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add superset/mcp_service/dashboard/widget_selectors.py \
        tests/unit_tests/mcp_service/dashboard/test_widget_selectors.py
git commit -m "feat(mcp): add widget-to-selector resolution from position_json"
```

---

## Task 3: Pydantic-схемы для CSS-тулз

**Files:**
- Modify: `superset/mcp_service/dashboard/schemas.py` (добавить в конец файла, после существующих схем)

**Interfaces:**
- Consumes: ничего.
- Produces (все — Pydantic `BaseModel`):
  - `GetDashboardCssRequest { identifier: int | str }`
  - `WidgetSummary { slice_name: str; chart_key: str; selector: str }`
  - `GetDashboardCssResponse { id, dashboard_title, css, css_length, blocks: list[str], widgets: list[WidgetSummary] }`
  - `SetDashboardCssRequest { identifier: int | str; css: str }`
  - `SetDashboardCssResponse { id, dashboard_title, css, css_length, changed: bool }`
  - `UpsertDashboardCssBlockRequest { identifier: int | str; block_name: str; css: str }`
  - `UpsertDashboardCssBlockResponse { id, block_name, action, css, css_length }`
  - `StyleDashboardWidgetRequest { identifier: int | str; widget_name: str; styles: str }`
  - `StyleDashboardWidgetResponse { id, widget_name, selector, action, css, css_length }`
  - `DashboardCssError { error: str; error_type: str }`
  - `DashboardCandidate { id: int; title: str }`
  - `AmbiguousMatchResponse { ambiguous: bool = True; candidates: list[DashboardCandidate]; message: str }`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/test_css_schemas.py
# (ASF license header — see Global Constraints; copy the 16-line block)
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCandidate,
    GetDashboardCssRequest,
    SetDashboardCssRequest,
    StyleDashboardWidgetRequest,
    UpsertDashboardCssBlockRequest,
    WidgetSummary,
)


def test_get_request_accepts_int_and_str():
    assert GetDashboardCssRequest(identifier=1).identifier == 1
    assert GetDashboardCssRequest(identifier="FDD").identifier == "FDD"


def test_style_request_fields():
    req = StyleDashboardWidgetRequest(
        identifier="FDD", widget_name="Выручка", styles="border: 1px solid red;"
    )
    assert req.widget_name == "Выручка"


def test_upsert_request_fields():
    req = UpsertDashboardCssBlockRequest(
        identifier=1, block_name="background", css=".dashboard{}"
    )
    assert req.block_name == "background"


def test_ambiguous_response_defaults_true():
    resp = AmbiguousMatchResponse(
        candidates=[DashboardCandidate(id=1, title="A")], message="multiple"
    )
    assert resp.ambiguous is True


def test_widget_summary_and_set_request():
    ws = WidgetSummary(slice_name="A", chart_key="CHART-x", selector="#CHART-x")
    assert ws.selector == "#CHART-x"
    assert SetDashboardCssRequest(identifier=1, css="a{}").css == "a{}"
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_schemas.py -v
```
Expected: FAIL — `ImportError: cannot import name 'GetDashboardCssRequest'`.

- [ ] **Step 3: Add schemas to `schemas.py`**

Убедиться, что вверху файла уже импортированы `BaseModel`, `Field` из `pydantic` (они есть — файл уже использует Pydantic). Добавить в конец `superset/mcp_service/dashboard/schemas.py`:

```python
# --- Dashboard CSS tools schemas ---


class GetDashboardCssRequest(BaseModel):
    identifier: int | str = Field(
        ..., description="Dashboard id, UUID, slug, or title"
    )


class WidgetSummary(BaseModel):
    slice_name: str = Field(..., description="Widget (chart) display name")
    chart_key: str = Field(..., description="Layout key, e.g. CHART-abc123")
    selector: str = Field(..., description="Outer CSS selector for the widget")


class GetDashboardCssResponse(BaseModel):
    id: int = Field(..., description="Dashboard id")
    dashboard_title: str | None = Field(None, description="Dashboard title")
    css: str = Field("", description="Current full CSS")
    css_length: int = Field(0, description="Length of css in characters")
    blocks: list[str] = Field(
        default_factory=list, description="Names of MCP-managed CSS blocks"
    )
    widgets: list[WidgetSummary] = Field(
        default_factory=list, description="Widgets with name->selector mapping"
    )


class SetDashboardCssRequest(BaseModel):
    identifier: int | str = Field(..., description="Dashboard id, UUID, slug, or title")
    css: str = Field(..., description="Full new CSS stylesheet (replaces existing)")


class SetDashboardCssResponse(BaseModel):
    id: int
    dashboard_title: str | None = None
    css: str = ""
    css_length: int = 0
    changed: bool = True


class UpsertDashboardCssBlockRequest(BaseModel):
    identifier: int | str = Field(..., description="Dashboard id, UUID, slug, or title")
    block_name: str = Field(..., description="Block slug, e.g. 'background'")
    css: str = Field(
        ..., description="CSS fragment for this block; empty string removes the block"
    )


class UpsertDashboardCssBlockResponse(BaseModel):
    id: int
    block_name: str
    action: str = Field(..., description="created | updated | removed")
    css: str = ""
    css_length: int = 0


class StyleDashboardWidgetRequest(BaseModel):
    identifier: int | str = Field(..., description="Dashboard id, UUID, slug, or title")
    widget_name: str = Field(..., description="Widget/chart display name on the dashboard")
    styles: str = Field(
        ...,
        description=(
            "Raw CSS properties, e.g. 'border: 2px solid red; border-radius: 12px;'. "
            "Empty string removes this widget's styles."
        ),
    )


class StyleDashboardWidgetResponse(BaseModel):
    id: int
    widget_name: str
    selector: str = Field("", description="Applied CSS selector(s)")
    action: str = Field(..., description="created | updated | removed")
    css: str = ""
    css_length: int = 0


class DashboardCssError(BaseModel):
    error: str = Field(..., description="Human-readable error message")
    error_type: str = Field(..., description="Error category")


class DashboardCandidate(BaseModel):
    id: int
    title: str


class AmbiguousMatchResponse(BaseModel):
    ambiguous: bool = True
    candidates: list[DashboardCandidate] = Field(default_factory=list)
    message: str = Field(..., description="Explanation to relay to the user")
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_schemas.py -v
```
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add superset/mcp_service/dashboard/schemas.py \
        tests/unit_tests/mcp_service/dashboard/test_css_schemas.py
git commit -m "feat(mcp): add pydantic schemas for dashboard css tools"
```

---

## Task 4: `css_write.py` — общий путь записи (резолв + RBAC + валидация + команда)

**Files:**
- Create: `superset/mcp_service/dashboard/css_write.py`
- Test: `tests/unit_tests/mcp_service/dashboard/test_css_write.py`

**Interfaces:**
- Consumes: `DashboardDAO`, `security_manager.raise_for_ownership`, `UpdateDashboardCommand`, `validate_css` из `superset.dashboards.schemas`.
- Produces:
  - `MAX_DASHBOARD_CSS_BYTES = 256 * 1024`
  - `class CssWriteError(Exception)` с `error_type: str`.
  - `resolve_dashboard(identifier: int | str) -> tuple[object | None, list[DashboardCandidate]]` — id/uuid/slug через `DashboardDAO.find_by_id`; иначе поиск по title (см. ниже). Неоднозначно → `(None, candidates)`; не найдено → `(None, [])`.
  - `authorize_edit(dashboard) -> None` — `raise_for_ownership`, иначе `CssWriteError(error_type="PermissionDenied")`.
  - `validate_and_size(css: str) -> None` — `validate_css` + лимит; иначе `CssWriteError(error_type="InvalidCss")`.
  - `persist_css(dashboard, css: str) -> object` — `UpdateDashboardCommand(id, {"css": css}).run()`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/test_css_write.py
# (ASF license header — see Global Constraints)
from unittest.mock import MagicMock, patch

import pytest

from superset.mcp_service.dashboard.css_write import (
    CssWriteError,
    MAX_DASHBOARD_CSS_BYTES,
    resolve_dashboard,
    validate_and_size,
)


def test_validate_and_size_rejects_dangerous_css():
    with pytest.raises(CssWriteError) as exc:
        validate_and_size("a { background: url(javascript:alert(1)); }")
    assert exc.value.error_type == "InvalidCss"


def test_validate_and_size_rejects_oversize():
    huge = "a{}" * (MAX_DASHBOARD_CSS_BYTES // 2)
    with pytest.raises(CssWriteError) as exc:
        validate_and_size(huge)
    assert exc.value.error_type == "InvalidCss"


def test_validate_and_size_accepts_normal_css():
    validate_and_size(".dashboard { background: red; }")  # no raise


def test_resolve_by_id_found():
    dash = MagicMock()
    dash.id = 1
    with patch(
        "superset.mcp_service.dashboard.css_write.DashboardDAO.find_by_id",
        return_value=dash,
    ):
        found, candidates = resolve_dashboard(1)
    assert found is dash
    assert candidates == []


def test_resolve_by_title_ambiguous():
    d1 = MagicMock(); d1.id = 1; d1.dashboard_title = "Продажи РФ"
    d2 = MagicMock(); d2.id = 2; d2.dashboard_title = "Продажи ЕС"
    with patch(
        "superset.mcp_service.dashboard.css_write.DashboardDAO.find_by_id",
        return_value=None,
    ), patch(
        "superset.mcp_service.dashboard.css_write._find_by_title",
        return_value=[d1, d2],
    ):
        found, candidates = resolve_dashboard("Продажи")
    assert found is None
    assert {c.title for c in candidates} == {"Продажи РФ", "Продажи ЕС"}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_write.py -v
```
Expected: FAIL — `ModuleNotFoundError: ... css_write`.

- [ ] **Step 3: Write minimal implementation**

```python
# superset/mcp_service/dashboard/css_write.py
# (ASF license header — see Global Constraints)

"""Shared write path for dashboard CSS MCP tools.

Resolves a dashboard (by id/uuid/slug/title), enforces edit ownership,
validates CSS (reusing the REST validator) with a size cap, and persists
through UpdateDashboardCommand.
"""

from marshmallow import ValidationError

from superset.daos.dashboard import DashboardDAO
from superset.dashboards.schemas import validate_css
from superset.mcp_service.dashboard.schemas import DashboardCandidate

MAX_DASHBOARD_CSS_BYTES = 256 * 1024


class CssWriteError(Exception):
    """Structured error for CSS write operations."""

    def __init__(self, message: str, error_type: str) -> None:
        super().__init__(message)
        self.message = message
        self.error_type = error_type


def _find_by_title(title: str) -> list:
    """Return dashboards whose title case-insensitively contains ``title``."""
    from superset.models.dashboard import Dashboard

    like = f"%{title.strip()}%"
    return (
        DashboardDAO.find_by_title_filter(like)
        if hasattr(DashboardDAO, "find_by_title_filter")
        else _find_by_title_fallback(Dashboard, like)
    )


def _find_by_title_fallback(model, like: str) -> list:
    from superset import db

    return (
        db.session.query(model)
        .filter(model.dashboard_title.ilike(like))
        .limit(25)
        .all()
    )


def resolve_dashboard(
    identifier: int | str,
) -> tuple[object | None, list[DashboardCandidate]]:
    """Resolve by id/uuid/slug first, then by title. Ambiguous -> candidates."""
    found = DashboardDAO.find_by_id(identifier)
    if found is not None:
        return found, []

    if isinstance(identifier, str):
        matches = _find_by_title(identifier)
        if len(matches) == 1:
            return matches[0], []
        if len(matches) > 1:
            return None, [
                DashboardCandidate(id=m.id, title=m.dashboard_title or "")
                for m in matches
            ]

    return None, []


def authorize_edit(dashboard) -> None:
    from superset import security_manager
    from superset.exceptions import SupersetSecurityException

    try:
        security_manager.raise_for_ownership(dashboard)
    except SupersetSecurityException as exc:
        raise CssWriteError(
            f"You don't have permission to edit dashboard "
            f"'{getattr(dashboard, 'dashboard_title', '')}'.",
            error_type="PermissionDenied",
        ) from exc


def validate_and_size(css: str) -> None:
    if len(css.encode("utf-8")) > MAX_DASHBOARD_CSS_BYTES:
        raise CssWriteError(
            f"CSS exceeds size limit ({MAX_DASHBOARD_CSS_BYTES} bytes).",
            error_type="InvalidCss",
        )
    try:
        validate_css(css)
    except ValidationError as exc:
        raise CssWriteError(str(exc.messages), error_type="InvalidCss") from exc


def persist_css(dashboard, css: str):
    from superset.commands.dashboard.update import UpdateDashboardCommand

    return UpdateDashboardCommand(dashboard.id, {"css": css}).run()
```

Примечание для реализующего: `DashboardDAO.find_by_id` в Superset принимает id (int) и
обычно резолвит по PK; если в этой версии он не резолвит UUID/slug — оставить как есть
(id-путь), title-путь покрывает остальное. Проверить сигнатуру `find_by_id` перед
финальным прогоном; `find_by_title_filter` может отсутствовать — тогда сработает fallback.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/test_css_write.py -v
```
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add superset/mcp_service/dashboard/css_write.py \
        tests/unit_tests/mcp_service/dashboard/test_css_write.py
git commit -m "feat(mcp): add shared dashboard css write path (resolve/rbac/validate)"
```

---

## Task 5: `get_dashboard_css` tool

**Files:**
- Create: `superset/mcp_service/dashboard/tool/get_dashboard_css.py`
- Test: `tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py`

**Interfaces:**
- Consumes: `resolve_dashboard` (Task 4), `find_blocks` (Task 1), `list_widgets` + `outer_selector` (Task 2), schemas (Task 3).
- Produces: async tool `get_dashboard_css(request: GetDashboardCssRequest, ctx) -> dict | DashboardCssError | AmbiguousMatchResponse`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py
# (ASF license header — see Global Constraints)
from unittest.mock import MagicMock, patch

import pytest
from fastmcp import Client

from superset.mcp_service.app import mcp
from superset.utils import json


@pytest.fixture
def mcp_server():
    return mcp


@pytest.mark.asyncio
async def test_get_dashboard_css_returns_css_blocks_widgets(mcp_server):
    dash = MagicMock()
    dash.id = 42
    dash.dashboard_title = "FDD"
    dash.css = (
        "/* mcp:block:background:start */\n.dashboard{background:red}\n"
        "/* mcp:block:background:end */"
    )
    dash.position_json = json.dumps(
        {
            "ROOT_ID": {"type": "ROOT", "children": ["CHART-aaa"]},
            "CHART-aaa": {"type": "CHART", "meta": {"sliceName": "Выручка", "chartId": 10}},
        }
    )
    with patch(
        "superset.mcp_service.dashboard.tool.get_dashboard_css.resolve_dashboard",
        return_value=(dash, []),
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "get_dashboard_css", {"request": {"identifier": 42}}
            )
    data = json.loads(result.content[0].text)
    assert data["id"] == 42
    assert data["blocks"] == ["background"]
    assert data["widgets"][0]["slice_name"] == "Выручка"
    assert data["widgets"][0]["selector"] == "#CHART-aaa"


@pytest.mark.asyncio
async def test_get_dashboard_css_ambiguous(mcp_server):
    from superset.mcp_service.dashboard.schemas import DashboardCandidate

    with patch(
        "superset.mcp_service.dashboard.tool.get_dashboard_css.resolve_dashboard",
        return_value=(None, [DashboardCandidate(id=1, title="A"), DashboardCandidate(id=2, title="B")]),
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "get_dashboard_css", {"request": {"identifier": "Prod"}}
            )
    data = json.loads(result.content[0].text)
    assert data["ambiguous"] is True
    assert len(data["candidates"]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py -v
```
Expected: FAIL — tool `get_dashboard_css` not registered / import error.

- [ ] **Step 3: Write the tool**

```python
# superset/mcp_service/dashboard/tool/get_dashboard_css.py
# (ASF license header — see Global Constraints)

"""MCP tool: get_dashboard_css — read a dashboard's CSS, blocks, and widgets."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
from superset.mcp_service.dashboard.css_blocks import find_blocks
from superset.mcp_service.dashboard.css_write import resolve_dashboard
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCssError,
    GetDashboardCssRequest,
    GetDashboardCssResponse,
    WidgetSummary,
)
from superset.mcp_service.dashboard.widget_selectors import (
    list_widgets,
    outer_selector,
)
from superset.utils import json

logger = logging.getLogger(__name__)


@tool(
    tags=["discovery"],
    class_permission_name="Dashboard",
    annotations=ToolAnnotations(
        title="Get dashboard CSS",
        readOnlyHint=True,
        destructiveHint=False,
    ),
)
async def get_dashboard_css(
    request: GetDashboardCssRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Read a dashboard's custom CSS, its MCP-managed blocks, and its widgets.

    ``identifier`` may be a dashboard id, UUID, slug, or title. Returns the
    full css, the names of MCP-managed blocks, and the list of widgets with a
    ready-to-use CSS selector for each — so you can target a widget by name
    without knowing DOM ids.

    If the title matches multiple dashboards, returns an ambiguous response
    with candidates; ask the user which one.
    """
    await ctx.info("Reading dashboard CSS: identifier=%s" % (request.identifier,))
    with event_logger.log_context(action="mcp.get_dashboard_css.resolve"):
        dashboard, candidates = resolve_dashboard(request.identifier)

    if dashboard is None:
        if candidates:
            return AmbiguousMatchResponse(
                candidates=candidates,
                message="Multiple dashboards match; specify which one.",
            )
        return DashboardCssError(
            error=f"Dashboard '{request.identifier}' not found.",
            error_type="NotFound",
        )

    css = dashboard.css or ""
    try:
        position = json.loads(dashboard.position_json or "{}")
    except (ValueError, TypeError):
        position = {}

    widgets = [
        WidgetSummary(
            slice_name=w.slice_name,
            chart_key=w.chart_key,
            selector=outer_selector(w.chart_key),
        )
        for w in list_widgets(position)
    ]

    return GetDashboardCssResponse(
        id=dashboard.id,
        dashboard_title=dashboard.dashboard_title,
        css=css,
        css_length=len(css),
        blocks=find_blocks(css),
        widgets=widgets,
    ).model_dump(mode="json")
```

- [ ] **Step 4: Register the tool**

В `superset/mcp_service/dashboard/tool/__init__.py` добавить импорт и в `__all__`:
```python
from .get_dashboard_css import get_dashboard_css
```
(добавить `"get_dashboard_css"` в список `__all__`.)

В `superset/mcp_service/app.py` — в существующий блок `from superset.mcp_service.dashboard.tool import (...)` (около строк 680–686, где уже перечислены `add_chart_to_existing_dashboard`, `generate_dashboard`, `get_dashboard_info`, `get_dashboard_layout`, `list_dashboards`) добавить `get_dashboard_css` в алфавитном порядке.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py -v
```
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add superset/mcp_service/dashboard/tool/get_dashboard_css.py \
        superset/mcp_service/dashboard/tool/__init__.py \
        superset/mcp_service/app.py \
        tests/unit_tests/mcp_service/dashboard/tool/test_get_dashboard_css.py
git commit -m "feat(mcp): add get_dashboard_css tool"
```

---

## Task 6: `set_dashboard_css` tool

**Files:**
- Create: `superset/mcp_service/dashboard/tool/set_dashboard_css.py`
- Test: `tests/unit_tests/mcp_service/dashboard/tool/test_set_dashboard_css.py`

**Interfaces:**
- Consumes: `resolve_dashboard`, `authorize_edit`, `validate_and_size`, `persist_css`, `CssWriteError` (Task 4); schemas (Task 3).
- Produces: async tool `set_dashboard_css(request, ctx) -> dict | DashboardCssError | AmbiguousMatchResponse`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/tool/test_set_dashboard_css.py
# (ASF license header — see Global Constraints)
from unittest.mock import MagicMock, patch

import pytest
from fastmcp import Client

from superset.mcp_service.app import mcp
from superset.utils import json

TOOL = "superset.mcp_service.dashboard.tool.set_dashboard_css"


@pytest.fixture
def mcp_server():
    return mcp


@pytest.mark.asyncio
async def test_set_dashboard_css_replaces(mcp_server):
    dash = MagicMock(); dash.id = 42; dash.dashboard_title = "FDD"
    updated = MagicMock(); updated.id = 42; updated.dashboard_title = "FDD"
    updated.css = ".dashboard{background:blue}"
    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])), patch(
        f"{TOOL}.authorize_edit"
    ), patch(f"{TOOL}.validate_and_size"), patch(
        f"{TOOL}.persist_css", return_value=updated
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "set_dashboard_css",
                {"request": {"identifier": 42, "css": ".dashboard{background:blue}"}},
            )
    data = json.loads(result.content[0].text)
    assert data["id"] == 42
    assert data["changed"] is True
    assert "blue" in data["css"]


@pytest.mark.asyncio
async def test_set_dashboard_css_invalid_returns_error(mcp_server):
    from superset.mcp_service.dashboard.css_write import CssWriteError

    dash = MagicMock(); dash.id = 42
    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])), patch(
        f"{TOOL}.authorize_edit"
    ), patch(
        f"{TOOL}.validate_and_size",
        side_effect=CssWriteError("bad", error_type="InvalidCss"),
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "set_dashboard_css",
                {"request": {"identifier": 42, "css": "@import url(x);"}},
            )
    data = json.loads(result.content[0].text)
    assert data["error_type"] == "InvalidCss"
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_set_dashboard_css.py -v
```
Expected: FAIL — tool not registered.

- [ ] **Step 3: Write the tool**

```python
# superset/mcp_service/dashboard/tool/set_dashboard_css.py
# (ASF license header — see Global Constraints)

"""MCP tool: set_dashboard_css — replace a dashboard's full CSS."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
from superset.mcp_service.dashboard.css_write import (
    authorize_edit,
    CssWriteError,
    persist_css,
    resolve_dashboard,
    validate_and_size,
)
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCssError,
    SetDashboardCssRequest,
    SetDashboardCssResponse,
)

logger = logging.getLogger(__name__)


@tool(
    tags=["mutate"],
    class_permission_name="Dashboard",
    method_permission_name="write",
    annotations=ToolAnnotations(
        title="Set dashboard CSS",
        readOnlyHint=False,
        destructiveHint=False,
    ),
)
async def set_dashboard_css(
    request: SetDashboardCssRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Replace a dashboard's entire custom CSS.

    Use this for wholesale replacement. For incremental named blocks (e.g. a
    background theme) prefer upsert_dashboard_css_block; for a specific widget
    prefer style_dashboard_widget. ``identifier`` may be id, UUID, slug, or title.
    """
    await ctx.info("Setting dashboard CSS: identifier=%s" % (request.identifier,))
    dashboard, candidates = resolve_dashboard(request.identifier)
    if dashboard is None:
        if candidates:
            return AmbiguousMatchResponse(
                candidates=candidates,
                message="Multiple dashboards match; specify which one.",
            )
        return DashboardCssError(
            error=f"Dashboard '{request.identifier}' not found.",
            error_type="NotFound",
        )

    try:
        authorize_edit(dashboard)
        validate_and_size(request.css)
        with event_logger.log_context(action="mcp.set_dashboard_css.write"):
            updated = persist_css(dashboard, request.css)
    except CssWriteError as exc:
        await ctx.warning("set_dashboard_css failed: %s" % (exc.message,))
        return DashboardCssError(error=exc.message, error_type=exc.error_type)

    css = updated.css or ""
    return SetDashboardCssResponse(
        id=updated.id,
        dashboard_title=updated.dashboard_title,
        css=css,
        css_length=len(css),
        changed=True,
    ).model_dump(mode="json")
```

- [ ] **Step 4: Register the tool**

`tool/__init__.py`: `from .set_dashboard_css import set_dashboard_css` + в `__all__`.
`app.py`: добавить `set_dashboard_css` в тот же импорт-блок dashboard-тулз.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_set_dashboard_css.py -v
```
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add superset/mcp_service/dashboard/tool/set_dashboard_css.py \
        superset/mcp_service/dashboard/tool/__init__.py \
        superset/mcp_service/app.py \
        tests/unit_tests/mcp_service/dashboard/tool/test_set_dashboard_css.py
git commit -m "feat(mcp): add set_dashboard_css tool"
```

---

## Task 7: `upsert_dashboard_css_block` tool

**Files:**
- Create: `superset/mcp_service/dashboard/tool/upsert_dashboard_css_block.py`
- Test: `tests/unit_tests/mcp_service/dashboard/tool/test_upsert_dashboard_css_block.py`

**Interfaces:**
- Consumes: `resolve_dashboard`, `authorize_edit`, `validate_and_size`, `persist_css`, `CssWriteError` (Task 4); `upsert_block` (Task 1); schemas (Task 3).
- Produces: async tool `upsert_dashboard_css_block(request, ctx) -> dict | DashboardCssError | AmbiguousMatchResponse`.

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/tool/test_upsert_dashboard_css_block.py
# (ASF license header — see Global Constraints)
from unittest.mock import MagicMock, patch

import pytest
from fastmcp import Client

from superset.mcp_service.app import mcp
from superset.utils import json

TOOL = "superset.mcp_service.dashboard.tool.upsert_dashboard_css_block"


@pytest.fixture
def mcp_server():
    return mcp


@pytest.mark.asyncio
async def test_upsert_block_created(mcp_server):
    dash = MagicMock(); dash.id = 42; dash.dashboard_title = "FDD"; dash.css = ""

    def fake_persist(d, css):
        d.css = css
        return d

    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])), patch(
        f"{TOOL}.authorize_edit"
    ), patch(f"{TOOL}.validate_and_size"), patch(
        f"{TOOL}.persist_css", side_effect=fake_persist
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "upsert_dashboard_css_block",
                {"request": {
                    "identifier": 42,
                    "block_name": "background",
                    "css": ".dashboard{background:red}",
                }},
            )
    data = json.loads(result.content[0].text)
    assert data["action"] == "created"
    assert data["block_name"] == "background"
    assert "mcp:block:background:start" in data["css"]


@pytest.mark.asyncio
async def test_upsert_block_removed_when_empty(mcp_server):
    existing = (
        "/* mcp:block:background:start */\n.d{background:red}\n"
        "/* mcp:block:background:end */\n"
    )
    dash = MagicMock(); dash.id = 42; dash.dashboard_title = "FDD"; dash.css = existing

    def fake_persist(d, css):
        d.css = css
        return d

    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])), patch(
        f"{TOOL}.authorize_edit"
    ), patch(f"{TOOL}.validate_and_size"), patch(
        f"{TOOL}.persist_css", side_effect=fake_persist
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "upsert_dashboard_css_block",
                {"request": {"identifier": 42, "block_name": "background", "css": ""}},
            )
    data = json.loads(result.content[0].text)
    assert data["action"] == "removed"
    assert "mcp:block:background" not in data["css"]
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_upsert_dashboard_css_block.py -v
```
Expected: FAIL — tool not registered.

- [ ] **Step 3: Write the tool**

```python
# superset/mcp_service/dashboard/tool/upsert_dashboard_css_block.py
# (ASF license header — see Global Constraints)

"""MCP tool: upsert_dashboard_css_block — idempotent named CSS block."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
from superset.mcp_service.dashboard.css_blocks import upsert_block
from superset.mcp_service.dashboard.css_write import (
    authorize_edit,
    CssWriteError,
    persist_css,
    resolve_dashboard,
    validate_and_size,
)
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCssError,
    UpsertDashboardCssBlockRequest,
    UpsertDashboardCssBlockResponse,
)

logger = logging.getLogger(__name__)


@tool(
    tags=["mutate"],
    class_permission_name="Dashboard",
    method_permission_name="write",
    annotations=ToolAnnotations(
        title="Upsert dashboard CSS block",
        readOnlyHint=False,
        destructiveHint=False,
    ),
)
async def upsert_dashboard_css_block(
    request: UpsertDashboardCssBlockRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Insert, replace, or remove a NAMED CSS block on a dashboard.

    The block is wrapped in markers so repeated calls update the same block
    instead of duplicating, and hand-written CSS is never touched. Pass an
    empty ``css`` to remove the block (e.g. "undo the red background").
    Use this for dashboard-wide styling (background, fonts, theme). For a
    specific widget use style_dashboard_widget. ``identifier`` may be id, UUID,
    slug, or title.
    """
    await ctx.info(
        "Upserting CSS block: identifier=%s, block=%s"
        % (request.identifier, request.block_name)
    )
    dashboard, candidates = resolve_dashboard(request.identifier)
    if dashboard is None:
        if candidates:
            return AmbiguousMatchResponse(
                candidates=candidates,
                message="Multiple dashboards match; specify which one.",
            )
        return DashboardCssError(
            error=f"Dashboard '{request.identifier}' not found.",
            error_type="NotFound",
        )

    new_css, action = upsert_block(dashboard.css, request.block_name, request.css)

    try:
        authorize_edit(dashboard)
        validate_and_size(new_css)
        with event_logger.log_context(action="mcp.upsert_dashboard_css_block.write"):
            updated = persist_css(dashboard, new_css)
    except CssWriteError as exc:
        await ctx.warning("upsert_dashboard_css_block failed: %s" % (exc.message,))
        return DashboardCssError(error=exc.message, error_type=exc.error_type)

    css = updated.css or ""
    return UpsertDashboardCssBlockResponse(
        id=updated.id,
        block_name=request.block_name,
        action=action,
        css=css,
        css_length=len(css),
    ).model_dump(mode="json")
```

- [ ] **Step 4: Register the tool**

`tool/__init__.py`: `from .upsert_dashboard_css_block import upsert_dashboard_css_block` + `__all__`.
`app.py`: добавить в импорт-блок dashboard-тулз.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_upsert_dashboard_css_block.py -v
```
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add superset/mcp_service/dashboard/tool/upsert_dashboard_css_block.py \
        superset/mcp_service/dashboard/tool/__init__.py \
        superset/mcp_service/app.py \
        tests/unit_tests/mcp_service/dashboard/tool/test_upsert_dashboard_css_block.py
git commit -m "feat(mcp): add upsert_dashboard_css_block tool"
```

---

## Task 8: `style_dashboard_widget` tool

**Files:**
- Create: `superset/mcp_service/dashboard/tool/style_dashboard_widget.py`
- Test: `tests/unit_tests/mcp_service/dashboard/tool/test_style_dashboard_widget.py`

**Interfaces:**
- Consumes: `resolve_dashboard`, `authorize_edit`, `validate_and_size`, `persist_css`, `CssWriteError` (Task 4); `upsert_block` (Task 1); `resolve_widget`, `build_widget_rule`, `outer_selector` (Task 2); schemas (Task 3).
- Produces: async tool `style_dashboard_widget(request, ctx) -> dict | DashboardCssError | AmbiguousMatchResponse`.
- Имя блока виджета: `"widget:" + <chart_key>` (стабильно и уникально).

- [ ] **Step 1: Write the failing test**

```python
# tests/unit_tests/mcp_service/dashboard/tool/test_style_dashboard_widget.py
# (ASF license header — see Global Constraints)
from unittest.mock import MagicMock, patch

import pytest
from fastmcp import Client

from superset.mcp_service.app import mcp
from superset.utils import json

TOOL = "superset.mcp_service.dashboard.tool.style_dashboard_widget"

POSITION = {
    "ROOT_ID": {"type": "ROOT", "children": ["CHART-aaa", "CHART-bbb"]},
    "CHART-aaa": {"type": "CHART", "meta": {"sliceName": "Выручка", "chartId": 10}},
    "CHART-bbb": {"type": "CHART", "meta": {"sliceName": "Заказы", "chartId": 11}},
}


def _dash():
    d = MagicMock()
    d.id = 42
    d.dashboard_title = "FDD"
    d.css = ""
    d.position_json = json.dumps(POSITION)
    return d


@pytest.fixture
def mcp_server():
    return mcp


@pytest.mark.asyncio
async def test_style_widget_applies_border(mcp_server):
    dash = _dash()

    def fake_persist(d, css):
        d.css = css
        return d

    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])), patch(
        f"{TOOL}.authorize_edit"
    ), patch(f"{TOOL}.validate_and_size"), patch(
        f"{TOOL}.persist_css", side_effect=fake_persist
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "style_dashboard_widget",
                {"request": {
                    "identifier": 42,
                    "widget_name": "Выручка",
                    "styles": "border: 2px solid red;",
                }},
            )
    data = json.loads(result.content[0].text)
    assert data["action"] == "created"
    assert "#CHART-aaa .dashboard-chart" in data["css"]
    assert "border: 2px solid red" in data["css"]


@pytest.mark.asyncio
async def test_style_widget_ambiguous_widget_name(mcp_server):
    position = {
        "ROOT_ID": {"type": "ROOT", "children": ["CHART-1", "CHART-2"]},
        "CHART-1": {"type": "CHART", "meta": {"sliceName": "Продажи РФ"}},
        "CHART-2": {"type": "CHART", "meta": {"sliceName": "Продажи ЕС"}},
    }
    dash = MagicMock(); dash.id = 42; dash.dashboard_title = "FDD"; dash.css = ""
    dash.position_json = json.dumps(position)
    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "style_dashboard_widget",
                {"request": {
                    "identifier": 42, "widget_name": "Продажи", "styles": "color: red;"
                }},
            )
    data = json.loads(result.content[0].text)
    assert data["error_type"] == "AmbiguousWidget"
    assert "Продажи РФ" in data["error"]
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_style_dashboard_widget.py -v
```
Expected: FAIL — tool not registered.

- [ ] **Step 3: Write the tool**

```python
# superset/mcp_service/dashboard/tool/style_dashboard_widget.py
# (ASF license header — see Global Constraints)

"""MCP tool: style_dashboard_widget — style one widget by name."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
from superset.mcp_service.dashboard.css_blocks import upsert_block
from superset.mcp_service.dashboard.css_write import (
    authorize_edit,
    CssWriteError,
    persist_css,
    resolve_dashboard,
    validate_and_size,
)
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCssError,
    StyleDashboardWidgetRequest,
    StyleDashboardWidgetResponse,
)
from superset.mcp_service.dashboard.widget_selectors import (
    build_widget_rule,
    outer_selector,
    resolve_widget,
)
from superset.utils import json

logger = logging.getLogger(__name__)


@tool(
    tags=["mutate"],
    class_permission_name="Dashboard",
    method_permission_name="write",
    annotations=ToolAnnotations(
        title="Style dashboard widget",
        readOnlyHint=False,
        destructiveHint=False,
    ),
)
async def style_dashboard_widget(
    request: StyleDashboardWidgetRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Apply CSS to a single widget (chart) on a dashboard, found BY NAME.

    You give only the widget name and CSS properties; the tool locates the
    widget in the layout and builds the correct selector for you — never invent
    selectors or DOM ids yourself, and don't try to style chart internals
    (axes, series). The selector level is chosen by property type
    (background/border -> inner tile, margin/transform -> outer container).
    Pass empty ``styles`` to remove this widget's styling.
    ``identifier`` may be id, UUID, slug, or title. If the widget name is
    ambiguous, an error listing the candidates is returned.
    """
    await ctx.info(
        "Styling widget: identifier=%s, widget=%s"
        % (request.identifier, request.widget_name)
    )
    dashboard, candidates = resolve_dashboard(request.identifier)
    if dashboard is None:
        if candidates:
            return AmbiguousMatchResponse(
                candidates=candidates,
                message="Multiple dashboards match; specify which one.",
            )
        return DashboardCssError(
            error=f"Dashboard '{request.identifier}' not found.",
            error_type="NotFound",
        )

    try:
        position = json.loads(dashboard.position_json or "{}")
    except (ValueError, TypeError):
        position = {}

    match, widget_candidates = resolve_widget(position, request.widget_name)
    if match is None:
        if widget_candidates:
            names = ", ".join(c.slice_name for c in widget_candidates)
            return DashboardCssError(
                error=f"Multiple widgets match '{request.widget_name}': {names}. "
                "Specify which one.",
                error_type="AmbiguousWidget",
            )
        return DashboardCssError(
            error=f"Widget '{request.widget_name}' not found on dashboard.",
            error_type="WidgetNotFound",
        )

    block_name = f"widget:{match.chart_key}"
    fragment = (
        build_widget_rule(match.chart_key, request.styles)
        if request.styles.strip()
        else ""
    )
    new_css, action = upsert_block(dashboard.css, block_name, fragment)

    try:
        authorize_edit(dashboard)
        validate_and_size(new_css)
        with event_logger.log_context(action="mcp.style_dashboard_widget.write"):
            updated = persist_css(dashboard, new_css)
    except CssWriteError as exc:
        await ctx.warning("style_dashboard_widget failed: %s" % (exc.message,))
        return DashboardCssError(error=exc.message, error_type=exc.error_type)

    css = updated.css or ""
    return StyleDashboardWidgetResponse(
        id=updated.id,
        widget_name=request.widget_name,
        selector=outer_selector(match.chart_key),
        action=action,
        css=css,
        css_length=len(css),
    ).model_dump(mode="json")
```

- [ ] **Step 4: Register the tool**

`tool/__init__.py`: `from .style_dashboard_widget import style_dashboard_widget` + `__all__`.
`app.py`: добавить в импорт-блок dashboard-тулз.

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/tool/test_style_dashboard_widget.py -v
```
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add superset/mcp_service/dashboard/tool/style_dashboard_widget.py \
        superset/mcp_service/dashboard/tool/__init__.py \
        superset/mcp_service/app.py \
        tests/unit_tests/mcp_service/dashboard/tool/test_style_dashboard_widget.py
git commit -m "feat(mcp): add style_dashboard_widget tool"
```

---

## Task 9: Обновить DEFAULT_INSTRUCTIONS и прогнать всё вместе

**Files:**
- Modify: `superset/mcp_service/app.py` (строка(и) `DEFAULT_INSTRUCTIONS`)

**Interfaces:**
- Consumes: все 4 тулзы.
- Produces: ничего нового (только текст инструкций + финальная верификация).

- [ ] **Step 1: Найти и дополнить DEFAULT_INSTRUCTIONS**

Текст инструкций генерируется функцией `get_default_instructions()` (в `app.py`;
`DEFAULT_INSTRUCTIONS = get_default_instructions()` на ~строке 485). Найти тело
функции (`grep -n "def get_default_instructions" superset/mcp_service/app.py`) и
добавить в возвращаемый текст абзац (в стиле существующего). Если текст собирается из
модуля branding — добавить в тот же источник, откуда берётся базовый текст.

```
Dashboard styling: use get_dashboard_css to inspect a dashboard's CSS,
its named blocks and its widgets (name -> selector). Use
upsert_dashboard_css_block for dashboard-wide styling (background, fonts,
theme), style_dashboard_widget to style one widget by name, and
set_dashboard_css only for full replacement. Name the dashboard explicitly
(id, slug, or title). Empty css/styles removes the block or widget styling.
Never invent CSS selectors for widgets — the tools build them.
```

- [ ] **Step 2: Прогнать всю dashboard-подпапку тестов**

Run:
```bash
run-tests tests/unit_tests/mcp_service/dashboard/ -v
```
Expected: PASS — все тесты Tasks 1–8 зелёные, существующие dashboard-тесты не сломаны.

- [ ] **Step 3: Проверить регистрацию всех 4 тулз в сервере**

Run (из `superset_tech/`):
```bash
docker run --rm --entrypoint python -w /app \
  -v "$(pwd)/superset":/app/superset:ro \
  superset_tech-superset -c "
import asyncio
from fastmcp import Client
from superset.mcp_service.app import mcp

async def main():
    async with Client(mcp) as c:
        names = {t.name for t in await c.list_tools()}
        for n in ['get_dashboard_css','set_dashboard_css','upsert_dashboard_css_block','style_dashboard_widget']:
            assert n in names, f'MISSING {n}'
        print('all 4 css tools registered')

asyncio.run(main())
"
```
Expected: `all 4 css tools registered`.

- [ ] **Step 4: Pre-commit (форматирование/типы) — на host в venv пользователя**

Pre-commit не входит в prod-образ. Прогнать на host (попросить пользователя
активировать его venv, если команда не найдена):
```bash
cd superset_tech && git add -A && pre-commit run --files \
    superset/mcp_service/dashboard/css_blocks.py \
    superset/mcp_service/dashboard/widget_selectors.py \
    superset/mcp_service/dashboard/css_write.py \
    superset/mcp_service/dashboard/schemas.py \
    superset/mcp_service/dashboard/tool/get_dashboard_css.py \
    superset/mcp_service/dashboard/tool/set_dashboard_css.py \
    superset/mcp_service/dashboard/tool/upsert_dashboard_css_block.py \
    superset/mcp_service/dashboard/tool/style_dashboard_widget.py \
    superset/mcp_service/app.py
```
Expected: hooks pass (или авто-фиксы — пересобрать `git add` и закоммитить фиксы). Если
pre-commit недоступен на host — отметить это и оставить пользователю.

- [ ] **Step 5: Commit**

```bash
git add superset/mcp_service/app.py
git commit -m "feat(mcp): document dashboard css tools in DEFAULT_INSTRUCTIONS"
```

---

## Self-Review (выполнено при написании плана)

**Покрытие спеки:**
- get/set/upsert-block/style-widget тулзы → Tasks 5–8. ✔
- Резолв по id/uuid/slug/title + неоднозначность → Task 4 (`resolve_dashboard`). ✔
- Именованные блоки, идемпотентность, сброс пустым css → Task 1 + используется в 7,8. ✔
- Резолв виджета + умный селектор по типу свойства → Task 2, используется в 8. ✔
- `validate_css` + лимит размера → Task 4 (`validate_and_size`). ✔
- RBAC через `raise_for_ownership` → Task 4 (`authorize_edit`). ✔
- Регистрация в `__init__.py` и `app.py`, DEFAULT_INSTRUCTIONS → Tasks 5–9. ✔
- ASF-заголовки, Python 3.10+ типы, Pydantic-схемы, event_logger, ctx-логи → во всех задачах. ✔

**Открытые пункты для реализующего (проверить в контейнере перед финалом):**
- Точная сигнатура `DashboardDAO.find_by_id` (резолвит ли UUID/slug помимо int) — если нет, title-путь покрывает; при необходимости расширить `resolve_dashboard`.
- Наличие `DashboardDAO.find_by_title_filter` — если метода нет, используется `_find_by_title_fallback` (уже в коде).
- `security_manager.raise_for_ownership` — подтверждён по `add_chart_to_existing_dashboard.py`.
- Точное имя переменной инструкций (`DEFAULT_INSTRUCTIONS`) в `app.py` — grep перед правкой.
