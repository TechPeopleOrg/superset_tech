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

"""MCP tool: style_dashboard_widget — style one widget by name."""

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
    StyleDashboardWidgetRequest,
    StyleDashboardWidgetResponse,
)
from superset.mcp_service.dashboard.widget_selectors import (
    build_widget_rule,
    outer_selector,
    resolve_widget,
)
from superset.utils import json

logger = logging.getLogger(__name__)


@tool(
    tags=["mutate"],
    class_permission_name="Dashboard",
    method_permission_name="write",
    annotations=ToolAnnotations(
        title="Style dashboard widget",
        readOnlyHint=False,
        destructiveHint=False,
    ),
)
async def style_dashboard_widget(
    request: StyleDashboardWidgetRequest, ctx: Context
) -> dict | DashboardCssError | AmbiguousMatchResponse:
    """Apply CSS to a single widget (chart) on a dashboard, found BY NAME.

    You give only the widget name and CSS properties; the tool locates the
    widget in the layout and builds the correct selector for you — never invent
    selectors or DOM ids yourself, and don't try to style chart internals
    (axes, series). The selector level is chosen by property type
    (background/border -> inner tile, margin/transform -> outer container).
    Pass empty ``styles`` to remove this widget's styling.
    ``identifier`` may be id, UUID, slug, or title. If the widget name is
    ambiguous, an error listing the candidates is returned.
    """
    await ctx.info(
        "Styling widget: identifier=%s, widget=%s"
        % (request.identifier, request.widget_name)
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

    try:
        position = json.loads(dashboard.position_json or "{}")
    except (ValueError, TypeError):
        position = {}

    match, widget_candidates = resolve_widget(position, request.widget_name)
    if match is None:
        if widget_candidates:
            names = ", ".join(c.slice_name for c in widget_candidates)
            return DashboardCssError(
                error=f"Multiple widgets match '{request.widget_name}': {names}. "
                "Specify which one.",
                error_type="AmbiguousWidget",
            )
        return DashboardCssError(
            error=f"Widget '{request.widget_name}' not found on dashboard.",
            error_type="WidgetNotFound",
        )

    block_name = f"widget:{match.chart_key}"
    fragment = (
        build_widget_rule(match.chart_key, request.styles)
        if request.styles.strip()
        else ""
    )
    new_css, action = upsert_block(dashboard.css, block_name, fragment)

    try:
        authorize_edit(dashboard)
        validate_and_size(new_css)
        with event_logger.log_context(action="mcp.style_dashboard_widget.write"):
            updated = persist_css(dashboard, new_css)
    except CssWriteError as exc:
        await ctx.warning("style_dashboard_widget failed: %s" % (exc.message,))
        return DashboardCssError(error=exc.message, error_type=exc.error_type)

    css = updated.css or ""
    return StyleDashboardWidgetResponse(
        id=updated.id,
        widget_name=request.widget_name,
        selector=outer_selector(match.chart_key),
        action=action,
        css=css,
        css_length=len(css),
    ).model_dump(mode="json")
