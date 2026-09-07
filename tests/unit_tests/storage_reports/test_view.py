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
from unittest.mock import patch

from superset.views.storage_reports import _with_author, StorageReportsView


def test_author_is_stamped_from_the_session():
    with patch("superset.views.storage_reports.get_username", return_value="ada"):
        metadata = json.loads(_with_author(json.dumps({"description": "leak"})))
    assert metadata == {"description": "leak", "author": "ada"}


def test_author_from_the_browser_is_overwritten():
    # A client that sends its own author must not be able to attribute a
    # report to someone else.
    payload = json.dumps({"description": "leak", "author": "someone-else"})
    with patch("superset.views.storage_reports.get_username", return_value="ada"):
        metadata = json.loads(_with_author(payload))
    assert metadata["author"] == "ada"


def test_malformed_metadata_does_not_break_the_upload():
    with patch("superset.views.storage_reports.get_username", return_value="ada"):
        assert json.loads(_with_author("not json")) == {"author": "ada"}
        assert json.loads(_with_author(None)) == {"author": "ada"}
        # A JSON scalar is valid JSON but not a metadata object.
        assert json.loads(_with_author("42")) == {"author": "ada"}


def test_is_report_accepts_only_the_report_category():
    view = StorageReportsView()
    settings = {
        "base_url": "http://storage:8000",
        "api_key": "k",
        "timeout": (3.0, 30.0),
    }
    with patch.object(StorageReportsView, "_storage_settings", return_value=settings):
        with patch(
            "superset.views.storage_reports.proxy_to_storage",
            return_value=(json.dumps({"category": "report"}).encode(), 200, {}),
        ):
            assert view._is_report("abc") is True

        with patch(
            "superset.views.storage_reports.proxy_to_storage",
            return_value=(json.dumps({"category": "bim"}).encode(), 200, {}),
        ):
            # A BIM model must not be readable through the reports page.
            assert view._is_report("abc") is False

        with patch(
            "superset.views.storage_reports.proxy_to_storage",
            return_value=(b"", 404, {}),
        ):
            assert view._is_report("missing") is False

        with patch(
            "superset.views.storage_reports.proxy_to_storage",
            return_value=(b"not json", 200, {}),
        ):
            assert view._is_report("abc") is False
