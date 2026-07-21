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

"""MCP tool: get_dashboard_css — read a dashboard's CSS, blocks, and widgets."""

import logging

from fastmcp import Context
from superset_core.mcp.decorators import tool, ToolAnnotations

from superset.extensions import event_logger
from superset.mcp_service.dashboard.css_blocks import find_blocks
from superset.mcp_service.dashboard.css_write import resolve_dashboard
from superset.mcp_service.dashboard.schemas import (
    AmbiguousMatchResponse,
    DashboardCssError,
    GetDashboardCssRequest,
    GetDashboardCssResponse,
    WidgetSummary,
)
from superset.mcp_service.dashboard.widget_selectors import (
    list_widgets,
    outer_selector,
)
from superset.utils import json

logger = logging.getLogger(__name__)


@tool(
    tags=["discovery"],
    class_permission_name="Dashboard",
    annotations=ToolAnnotations(
        title="Get dashboard CSS",
        readOnlyHint=True,
        destructiveHint=False,
    ),
)
async def get_dashboard_css(
    request: GetDashboardCssRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Read a dashboard's custom CSS, its MCP-managed blocks, and its widgets.

    ``identifier`` may be a dashboard id, UUID, slug, or title. Returns the
    full css, the names of MCP-managed blocks, and the list of widgets with a
    ready-to-use CSS selector for each — so you can target a widget by name
    without knowing DOM ids.

    If the title matches multiple dashboards, returns an ambiguous response
    with candidates; ask the user which one.
    """
    await ctx.info("Reading dashboard CSS: identifier=%s" % (request.identifier,))
    with event_logger.log_context(action="mcp.get_dashboard_css.resolve"):
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

    css = dashboard.css or ""
    try:
        position = json.loads(dashboard.position_json or "{}")
    except (ValueError, TypeError):
        position = {}

    widgets = [
        WidgetSummary(
            slice_name=w.slice_name,
            chart_key=w.chart_key,
            selector=outer_selector(w.chart_key),
        )
        for w in list_widgets(position)
    ]

    return GetDashboardCssResponse(
        id=dashboard.id,
        dashboard_title=dashboard.dashboard_title,
        css=css,
        css_length=len(css),
        blocks=find_blocks(css),
        widgets=widgets,
    ).model_dump(mode="json")
