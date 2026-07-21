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

"""Shared write path for dashboard CSS MCP tools.

Resolves a dashboard (by id/uuid/title), enforces edit ownership, validates
CSS (reusing the REST validator) with a size cap, and persists through
UpdateDashboardCommand.
"""

from typing import Any

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
    from superset import db
    from superset.models.dashboard import Dashboard

    like = f"%{title.strip()}%"
    return (
        db.session.query(Dashboard)
        .filter(Dashboard.dashboard_title.ilike(like))
        .limit(25)
        .all()
    )


def resolve_dashboard(
    identifier: int | str,
) -> tuple[Any | None, list[DashboardCandidate]]:
    """Resolve by id/uuid first, then by title. Ambiguous -> candidates."""
    from superset.daos.dashboard import DashboardDAO

    if isinstance(identifier, int):
        found = DashboardDAO.find_by_id(identifier)
        return (found, []) if found is not None else (None, [])

    # String identifier: try id/uuid, then fall back to title search.
    found = DashboardDAO.find_by_id_or_uuid(identifier)
    if found is not None:
        return found, []

    matches = _find_by_title(identifier)
    if len(matches) == 1:
        return matches[0], []
    if len(matches) > 1:
        return None, [
            DashboardCandidate(id=m.id, title=m.dashboard_title or "")
            for m in matches
        ]
    return None, []


def authorize_edit(dashboard: Any) -> None:
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
    from marshmallow import ValidationError

    from superset.dashboards.schemas import validate_css

    if len(css.encode("utf-8")) > MAX_DASHBOARD_CSS_BYTES:
        raise CssWriteError(
            f"CSS exceeds size limit ({MAX_DASHBOARD_CSS_BYTES} bytes).",
            error_type="InvalidCss",
        )
    try:
        validate_css(css)
    except ValidationError as exc:
        raise CssWriteError(str(exc.messages), error_type="InvalidCss") from exc


def persist_css(dashboard: Any, css: str) -> Any:
    from superset.commands.dashboard.update import UpdateDashboardCommand

    return UpdateDashboardCommand(dashboard.id, {"css": css}).run()
