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
