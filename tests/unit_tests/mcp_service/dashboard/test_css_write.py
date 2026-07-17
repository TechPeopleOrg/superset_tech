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
    d1 = MagicMock()
    d1.id = 1
    d1.dashboard_title = "Продажи РФ"
    d2 = MagicMock()
    d2.id = 2
    d2.dashboard_title = "Продажи ЕС"
    with patch(
        "superset.mcp_service.dashboard.css_write.DashboardDAO.find_by_id_or_uuid",
        return_value=None,
    ), patch(
        "superset.mcp_service.dashboard.css_write._find_by_title",
        return_value=[d1, d2],
    ):
        found, candidates = resolve_dashboard("Продажи")
    assert found is None
    assert {c.title for c in candidates} == {"Продажи РФ", "Продажи ЕС"}
