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
