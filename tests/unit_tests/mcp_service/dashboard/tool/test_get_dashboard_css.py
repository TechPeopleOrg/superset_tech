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
            "CHART-aaa": {
                "type": "CHART",
                "meta": {"sliceName": "Выручка", "chartId": 10},
            },
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
        return_value=(
            None,
            [DashboardCandidate(id=1, title="A"), DashboardCandidate(id=2, title="B")],
        ),
    ):
        async with Client(mcp_server) as client:
            result = await client.call_tool(
                "get_dashboard_css", {"request": {"identifier": "Prod"}}
            )
    data = json.loads(result.content[0].text)
    assert data["ambiguous"] is True
    assert len(data["candidates"]) == 2
