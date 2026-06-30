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

from superset import security_manager
from tests.integration_tests.base_tests import SupersetTestCase


class TestFileUploaderView(SupersetTestCase):
    def test_index_requires_login(self):
        rv = self.client.get("/fileuploader/", follow_redirects=False)
        assert rv.status_code in (301, 302)  # redirect to login

    def test_permissions_exist(self):
        # FileUploaderView declares an explicit method_permission_name mapping
        # (view/upload/edit/delete), so FAB registers permissions without the
        # "can_" prefix used for views relying on the default mapping. The
        # exact spelling will be re-confirmed against the running app (with a
        # live DB) in the later end-to-end verification task; until then this
        # assertion accepts both spellings to stay robust.
        view_menu = security_manager.find_view_menu("FileUploader")
        assert view_menu is not None, "FileUploaderView is not registered"

        permission_names = {
            pvm.permission.name
            for pvm in security_manager.find_permissions_view_menu(view_menu)
        }
        expected = {"view", "upload", "edit", "delete"}
        expected_can = {f"can_{name}" for name in expected}
        assert expected.issubset(permission_names) or expected_can.issubset(
            permission_names
        )

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

    def test_upload_denied_without_permission_does_not_reach_storage(self):
        # We deliberately do NOT rely on the default "gamma" role here: whether
        # gamma happens to carry FileUploader permissions depends on fixture
        # setup and could drift over time. Creating a dedicated user with an
        # explicitly empty role list (no roles at all) guarantees the absence
        # of the "upload on FileUploader" permission regardless of fixtures,
        # making this a robust negative test for the @has_access_api gate.
        self.create_user_with_roles("file_uploader_no_perms_post", roles=[])
        self.login(username="file_uploader_no_perms_post")
        with patch("superset.views.file_uploader.proxy_to_storage") as proxy:
            rv = self.client.post("/fileuploader/api/files", data=b"x")
            assert rv.status_code in (401, 403, 302)
            proxy.assert_not_called()

    def test_delete_denied_without_permission(self):
        # See comment in test_upload_denied_without_permission_does_not_reach_storage
        # for why a dedicated, role-less user is used instead of "gamma".
        self.create_user_with_roles("file_uploader_no_perms_delete", roles=[])
        self.login(username="file_uploader_no_perms_delete")
        with patch("superset.views.file_uploader.proxy_to_storage") as proxy:
            rv = self.client.delete("/fileuploader/api/files/123")
            assert rv.status_code in (401, 403, 302)
            proxy.assert_not_called()
