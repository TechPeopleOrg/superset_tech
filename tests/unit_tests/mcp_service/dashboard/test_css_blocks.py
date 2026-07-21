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
from superset.mcp_service.dashboard.css_blocks import (
    find_blocks,
    remove_all_blocks,
    upsert_block,
)


def test_upsert_creates_block_and_preserves_foreign_css():
    css = ".dashboard { color: black; }"
    new_css, action = upsert_block(css, "background", ".dashboard { background: red; }")
    assert action == "created"
    # foreign CSS untouched
    assert ".dashboard { color: black; }" in new_css
    # block wrapped in markers
    assert "/* mcp:block:background:start */" in new_css
    assert "/* mcp:block:background:end */" in new_css
    assert ".dashboard { background: red; }" in new_css


def test_upsert_updates_existing_block_no_duplicate():
    css, _ = upsert_block("", "background", "a { background: red; }")
    new_css, action = upsert_block(css, "background", "a { background: blue; }")
    assert action == "updated"
    assert new_css.count("/* mcp:block:background:start */") == 1
    assert "blue" in new_css
    assert "red" not in new_css


def test_empty_fragment_removes_block():
    css, _ = upsert_block("", "background", "a { background: red; }")
    new_css, action = upsert_block(css, "background", "   ")
    assert action == "removed"
    assert "mcp:block:background" not in new_css


def test_find_blocks_lists_names_in_order():
    css, _ = upsert_block("", "first", "a {}")
    css, _ = upsert_block(css, "second", "b {}")
    assert find_blocks(css) == ["first", "second"]


def test_remove_all_blocks_keeps_manual_css():
    manual = ".manual { color: green; }"
    css, _ = upsert_block(manual, "one", "a {}")
    css, _ = upsert_block(css, "two", "b {}")
    result = remove_all_blocks(css)
    assert "mcp:block" not in result
    assert ".manual { color: green; }" in result


def test_find_blocks_on_none_returns_empty():
    assert find_blocks(None) == []
