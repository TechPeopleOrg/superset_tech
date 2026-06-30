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
from unittest.mock import patch

from tests.integration_tests.base_tests import SupersetTestCase


class TestFileUploaderView(SupersetTestCase):
    def test_index_renders_without_storage(self):
        """Page must render even if storage is down (no storage call here)."""
        self.login(username="admin")
        with patch("superset.views.file_uploader.proxy_to_storage") as proxy:
            rv = self.client.get("/fileuploader/")
            assert rv.status_code == 200
            proxy.assert_not_called()  # page render never touches storage

    def test_get_list_proxies(self):
        self.login(username="admin")
        with patch(
            "superset.views.file_uploader.proxy_to_storage",
            return_value=(b'{"items":[]}', 200, {"Content-Type": "application/json"}),
        ) as proxy:
            rv = self.client.get("/fileuploader/api/files?folder=x")
            assert rv.status_code == 200
            assert rv.data == b'{"items":[]}'
            args, kwargs = proxy.call_args
            assert args[0] == "GET"
            assert args[1] == "files"

    def test_storage_down_returns_502_not_500(self):
        self.login(username="admin")
        with patch(
            "superset.views.file_uploader.proxy_to_storage",
            return_value=(b'{"error":"x"}', 502, {"Content-Type": "application/json"}),
        ):
            rv = self.client.get("/fileuploader/api/files")
            assert rv.status_code == 502  # never 500
