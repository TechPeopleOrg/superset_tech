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

TOOL = "superset.mcp_service.dashboard.tool.upsert_dashboard_css_block"


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
async def test_upsert_block_created(mcp_server):
    dash = MagicMock()
    dash.id = 42
    dash.dashboard_title = "FDD"
    dash.css = ""

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
                {
                    "request": {
                        "identifier": 42,
                        "block_name": "background",
                        "css": ".dashboard{background:red}",
                    }
                },
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
    dash = MagicMock()
    dash.id = 42
    dash.dashboard_title = "FDD"
    dash.css = existing

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
