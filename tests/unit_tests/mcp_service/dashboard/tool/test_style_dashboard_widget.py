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
from unittest.mock import MagicMock, Mock, patch

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


@pytest.fixture(autouse=True)
def mock_auth():
    with patch("superset.mcp_service.auth.get_user_from_request") as mock_get_user:
        mock_user = Mock()
        mock_user.id = 1
        mock_user.username = "admin"
        mock_get_user.return_value = mock_user
        yield mock_get_user


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
                {
                    "request": {
                        "identifier": 42,
                        "widget_name": "Выручка",
                        "styles": "border: 2px solid red;",
                    }
                },
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
    dash = MagicMock()
    dash.id = 42
    dash.dashboard_title = "FDD"
    dash.css = ""
    dash.position_json = json.dumps(position)
    with patch(f"{TOOL}.resolve_dashboard", return_value=(dash, [])):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "style_dashboard_widget",
                {
                    "request": {
                        "identifier": 42,
                        "widget_name": "Продажи",
                        "styles": "color: red;",
                    }
                },
            )
    data = json.loads(result.content[0].text)
    assert data["error_type"] == "AmbiguousWidget"
    assert "Продажи РФ" in data["error"]
