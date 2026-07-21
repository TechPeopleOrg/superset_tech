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
