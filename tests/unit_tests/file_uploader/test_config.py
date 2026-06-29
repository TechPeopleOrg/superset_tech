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
import importlib


def test_storage_config_defaults(monkeypatch):
    for var in (
        "STORAGE_BASE_URL",
        "STORAGE_API_KEY",
        "STORAGE_PROXY_CONNECT_TIMEOUT",
        "STORAGE_PROXY_READ_TIMEOUT",
    ):
        monkeypatch.delenv(var, raising=False)
    config = importlib.reload(importlib.import_module("superset.config"))
    assert config.STORAGE_BASE_URL == "http://file-storage:8000"
    assert config.STORAGE_API_KEY == "change-me-dev-key"
    assert config.STORAGE_PROXY_CONNECT_TIMEOUT == 3.0
    assert config.STORAGE_PROXY_READ_TIMEOUT == 30.0


def test_storage_config_env_override(monkeypatch):
    monkeypatch.setenv("STORAGE_BASE_URL", "http://example:9000")
    monkeypatch.setenv("STORAGE_API_KEY", "secret")
    monkeypatch.setenv("STORAGE_PROXY_CONNECT_TIMEOUT", "5")
    monkeypatch.setenv("STORAGE_PROXY_READ_TIMEOUT", "60")
    config = importlib.reload(importlib.import_module("superset.config"))
    assert config.STORAGE_BASE_URL == "http://example:9000"
    assert config.STORAGE_API_KEY == "secret"
    assert config.STORAGE_PROXY_CONNECT_TIMEOUT == 5.0
    assert config.STORAGE_PROXY_READ_TIMEOUT == 60.0
