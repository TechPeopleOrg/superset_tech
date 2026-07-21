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

TOOL = "superset.mcp_service.dashboard.tool.set_dashboard_css"


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
async def test_set_dashboard_css_replaces(mcp_server):
    dash = MagicMock()
    dash.id = 42
    dash.dashboard_title = "FDD"
    updated = MagicMock()
    updated.id = 42
    updated.dashboard_title = "FDD"
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

    dash = MagicMock()
    dash.id = 42
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
