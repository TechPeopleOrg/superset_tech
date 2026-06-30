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
"""File Uploader page: serves the SPA page and proxies browser requests to the
standalone file-storage service, injecting the API key server-side.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import requests
from flask import current_app, g, request, Response
from flask_appbuilder import expose
from flask_appbuilder.security.decorators import has_access, has_access_api

from superset.superset_typing import FlaskResponse
from superset.views.base import BaseSupersetView, common_bootstrap_payload
from superset.views.utils import bootstrap_user_data

logger = logging.getLogger(__name__)

_HOP_BY_HOP = {"host", "cookie", "content-length", "connection"}


def proxy_to_storage(
    method: str,
    subpath: str,
    *,
    query_string: bytes,
    headers: dict[str, str],
    body: Any,
    base_url: str,
    api_key: str,
    timeout: tuple[float, float],
) -> tuple[bytes, int, dict[str, str]]:
    """Forward a request to the file-storage service with the API key injected.

    Returns (content, status_code, response_headers). Network failures are
    converted to 502/504 so the storage service can never crash Superset.
    """
    fwd_headers = {
        k: v for k, v in headers.items() if k.lower() not in _HOP_BY_HOP
    }
    fwd_headers["X-API-Key"] = api_key

    url = f"{base_url.rstrip('/')}/{subpath.lstrip('/')}"
    qs = query_string.decode() if isinstance(query_string, bytes) else (query_string or "")
    if qs:
        url = f"{url}?{qs}"

    try:
        resp = requests.request(
            method=method,
            url=url,
            headers=fwd_headers,
            data=body,
            timeout=timeout,
        )
        return resp.content, resp.status_code, dict(resp.headers)
    except requests.exceptions.Timeout:
        logger.warning("file-storage timed out: %s %s", method, url)
        return (
            json.dumps({"error": "File storage did not respond in time."}).encode(),
            504,
            {"Content-Type": "application/json"},
        )
    except requests.exceptions.RequestException as ex:
        logger.warning("file-storage unreachable: %s %s (%s)", method, url, ex)
        return (
            json.dumps({"error": "File storage is currently unavailable."}).encode(),
            502,
            {"Content-Type": "application/json"},
        )


class FileUploaderView(BaseSupersetView):
    """Serves the File Uploader SPA page and proxies browser requests to the
    standalone file-storage service.
    """

    route_base = "/fileuploader"
    class_permission_name = "FileUploader"
    method_permission_name = {
        "index": "view",
        "proxy_get": "view",
        "proxy_post": "upload",
        "proxy_patch": "edit",
        "proxy_put": "edit",
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

    def _proxy(self, subpath: str) -> FlaskResponse:
        content, status, headers = proxy_to_storage(
            request.method,
            subpath,
            query_string=request.query_string,
            headers=dict(request.headers),
            body=request.get_data(),
            base_url=current_app.config["STORAGE_BASE_URL"],
            api_key=current_app.config["STORAGE_API_KEY"],
            timeout=(
                current_app.config["STORAGE_PROXY_CONNECT_TIMEOUT"],
                current_app.config["STORAGE_PROXY_READ_TIMEOUT"],
            ),
        )
        resp = Response(content, status=status)
        if "Content-Type" in headers:
            resp.headers["Content-Type"] = headers["Content-Type"]
        if "Content-Disposition" in headers:
            resp.headers["Content-Disposition"] = headers["Content-Disposition"]
        return resp

    @expose("/api/<path:subpath>", methods=("GET",))
    @has_access_api
    def proxy_get(self, subpath: str) -> FlaskResponse:
        return self._proxy(subpath)

    @expose("/api/<path:subpath>", methods=("POST",))
    @has_access_api
    def proxy_post(self, subpath: str) -> FlaskResponse:
        return self._proxy(subpath)

    @expose("/api/<path:subpath>", methods=("PATCH",))
    @has_access_api
    def proxy_patch(self, subpath: str) -> FlaskResponse:
        return self._proxy(subpath)

    @expose("/api/<path:subpath>", methods=("PUT",))
    @has_access_api
    def proxy_put(self, subpath: str) -> FlaskResponse:
        return self._proxy(subpath)

    @expose("/api/<path:subpath>", methods=("DELETE",))
    @has_access_api
    def proxy_delete(self, subpath: str) -> FlaskResponse:
        return self._proxy(subpath)
