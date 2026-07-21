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
