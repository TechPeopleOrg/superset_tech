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
"""Report log page: dashboard/chart snapshots saved to file storage together
with a problem description and date.

Reports live in the same file-storage service as uploaded files, under the
``report`` category. This view proxies to that service like the File Uploader
does, but pins every request to the report category, so holding the report
permission never grants access to the rest of the storage.
"""
from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import urlencode

from flask import current_app, g, request, Response
from flask_appbuilder import expose
from flask_appbuilder.security.decorators import has_access, has_access_api

from superset.superset_typing import FlaskResponse
from superset.views.base import BaseSupersetView, common_bootstrap_payload
from superset.views.file_uploader import proxy_to_storage, with_author
from superset.views.utils import bootstrap_user_data

logger = logging.getLogger(__name__)

REPORT_CATEGORY = "report"


def _forbidden(message: str) -> Response:
    return Response(
        json.dumps({"error": message}),
        status=403,
        content_type="application/json",
    )


class StorageReportsView(BaseSupersetView):
    """Serves the report log SPA page and proxies to the file-storage service,
    constrained to the report category.

    Named ``StorageReports`` rather than ``Reports`` because Superset already
    uses that name for alert/report schedules; the two are unrelated.
    """

    route_base = "/storagereports"
    # FAB's BaseView defaults to "list"; the Manage-menu link is built from
    # default_view, and this view exposes "index" (an SPA page), not "list".
    default_view = "index"
    class_permission_name = "StorageReports"
    method_permission_name = {
        "index": "view",
        "proxy_get": "view",
        "proxy_get_list": "view",
        "proxy_post": "upload",
        "proxy_patch": "edit",
        "proxy_delete": "delete",
    }

    @expose("/")
    @has_access
    def index(self) -> FlaskResponse:
        payload = {
            "user": bootstrap_user_data(g.user, include_perms=True),
            "common": common_bootstrap_payload(),
        }
        return self.render_app_template(extra_bootstrap_data=payload)

    def _storage_settings(self) -> dict[str, Any]:
        return {
            "base_url": current_app.config["STORAGE_BASE_URL"],
            "api_key": current_app.config["STORAGE_API_KEY"],
            "timeout": (
                current_app.config["STORAGE_PROXY_CONNECT_TIMEOUT"],
                current_app.config["STORAGE_PROXY_READ_TIMEOUT"],
            ),
        }

    def _is_report(self, file_ref: str) -> bool:
        """Ask the storage service whether a file is a report.

        Guards the per-file routes: without this check, a report-only user
        could read or delete any file in storage by guessing its id.
        """
        content, status, _ = proxy_to_storage(
            "GET",
            f"files/{file_ref}",
            query_string=b"",
            headers={},
            body=None,
            **self._storage_settings(),
        )
        if status != 200:
            return False
        try:
            return json.loads(content).get("category") == REPORT_CATEGORY
        except (ValueError, AttributeError):
            return False

    def _proxy(
        self, subpath: str, *, query_string: bytes | None = None
    ) -> FlaskResponse:
        data: dict[str, Any] | None = None
        files: list[tuple[str, Any]] | None = None
        body: Any = None
        is_multipart = bool(request.files) or (
            request.content_type is not None
            and request.content_type.startswith("multipart/")
        )
        if is_multipart:
            # Flask consumed the stream while parsing the form, so rebuild the
            # multipart body from the parsed parts — same as the File Uploader.
            data = dict(request.form)
            # An upload may only ever land in the report category, whatever the
            # browser asked for.
            data["category"] = REPORT_CATEGORY
            data["metadata"] = with_author(data.get("metadata"))
            files = [
                (key, (fs.filename, fs.stream, fs.mimetype))
                for key, fs in request.files.items(multi=True)
            ]
        else:
            body = request.get_data()

        content, status, headers = proxy_to_storage(
            request.method,
            subpath,
            query_string=(
                request.query_string if query_string is None else query_string
            ),
            headers=dict(request.headers),
            body=body,
            data=data,
            files=files,
            **self._storage_settings(),
        )
        resp = Response(content, status=status)
        lower_headers = {k.lower(): v for k, v in headers.items()}
        if "content-type" in lower_headers:
            resp.headers["Content-Type"] = lower_headers["content-type"]
        if "content-disposition" in lower_headers:
            resp.headers["Content-Disposition"] = lower_headers["content-disposition"]
        return resp

    @expose("/api/files", methods=("GET",))
    @has_access_api
    def proxy_get_list(self) -> FlaskResponse:
        # Pin the listing to reports, dropping any category the caller passed.
        params = {k: v for k, v in request.args.items() if k != "category"}
        params["category"] = REPORT_CATEGORY
        return self._proxy("files", query_string=urlencode(params).encode())

    @expose("/api/files/<path:subpath>", methods=("GET",))
    @has_access_api
    def proxy_get(self, subpath: str) -> FlaskResponse:
        file_ref = subpath.split("/", 1)[0]
        if not self._is_report(file_ref):
            return _forbidden("Not a report.")
        return self._proxy(f"files/{subpath}")

    @expose("/api/files", methods=("POST",))
    @has_access_api
    def proxy_post(self) -> FlaskResponse:
        return self._proxy("files")

    @expose("/api/files/<path:subpath>", methods=("PATCH",))
    @has_access_api
    def proxy_patch(self, subpath: str) -> FlaskResponse:
        file_ref = subpath.split("/", 1)[0]
        if not self._is_report(file_ref):
            return _forbidden("Not a report.")
        return self._proxy(f"files/{subpath}")

    @expose("/api/files/<path:subpath>", methods=("DELETE",))
    @has_access_api
    def proxy_delete(self, subpath: str) -> FlaskResponse:
        file_ref = subpath.split("/", 1)[0]
        if not self._is_report(file_ref):
            return _forbidden("Not a report.")
        return self._proxy(f"files/{subpath}")
