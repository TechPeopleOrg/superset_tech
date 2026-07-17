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

"""MCP tool: set_dashboard_css — replace a dashboard's full CSS."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
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
    SetDashboardCssRequest,
    SetDashboardCssResponse,
)

logger = logging.getLogger(__name__)


@tool(
    tags=["mutate"],
    class_permission_name="Dashboard",
    method_permission_name="write",
    annotations=ToolAnnotations(
        title="Set dashboard CSS",
        readOnlyHint=False,
        destructiveHint=False,
    ),
)
async def set_dashboard_css(
    request: SetDashboardCssRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Replace a dashboard's entire custom CSS.

    Use this for wholesale replacement. For incremental named blocks (e.g. a
    background theme) prefer upsert_dashboard_css_block; for a specific widget
    prefer style_dashboard_widget. ``identifier`` may be id, UUID, slug, or title.
    """
    await ctx.info("Setting dashboard CSS: identifier=%s" % (request.identifier,))
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

    try:
        authorize_edit(dashboard)
        validate_and_size(request.css)
        with event_logger.log_context(action="mcp.set_dashboard_css.write"):
            updated = persist_css(dashboard, request.css)
    except CssWriteError as exc:
        await ctx.warning("set_dashboard_css failed: %s" % (exc.message,))
        return DashboardCssError(error=exc.message, error_type=exc.error_type)

    css = updated.css or ""
    return SetDashboardCssResponse(
        id=updated.id,
        dashboard_title=updated.dashboard_title,
        css=css,
        css_length=len(css),
        changed=True,
    ).model_dump(mode="json")
