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
import json
from unittest.mock import MagicMock, patch

import requests

from superset.views.file_uploader import proxy_to_storage

TIMEOUT = (3.0, 30.0)


def _call(method="GET", subpath="files", body=None):
    return proxy_to_storage(
        method,
        subpath,
        query_string=b"folder=plans",
        headers={"Content-Type": "application/json"},
        body=body,
        base_url="http://storage:8000",
        api_key="secret-key",
        timeout=TIMEOUT,
    )


def test_injects_api_key_and_forwards():
    fake = MagicMock(status_code=200, content=b'{"ok":true}', headers={"Content-Type": "application/json"})
    with patch("superset.views.file_uploader.requests.request", return_value=fake) as req:
        content, status, _ = _call()
    assert status == 200
    assert content == b'{"ok":true}'
    _, kwargs = req.call_args
    assert kwargs["headers"]["X-API-Key"] == "secret-key"
    assert kwargs["url"] == "http://storage:8000/files?folder=plans"
    assert kwargs["timeout"] == TIMEOUT


def test_connection_error_returns_502():
    with patch(
        "superset.views.file_uploader.requests.request",
        side_effect=requests.exceptions.ConnectionError(),
    ):
        content, status, _ = _call()
    assert status == 502
    assert json.loads(content)["error"]


def test_timeout_returns_504():
    with patch(
        "superset.views.file_uploader.requests.request",
        side_effect=requests.exceptions.Timeout(),
    ):
        content, status, _ = _call()
    assert status == 504
    assert json.loads(content)["error"]
