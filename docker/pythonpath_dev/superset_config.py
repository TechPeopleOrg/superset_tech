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
#
# This file is included in the final Docker image and SHOULD be overridden when
# deploying the image to prod. Settings configured here are intended for use in local
# development environments. Also note that superset_config_docker.py is imported
# as a final step as a means to override "defaults" configured here
#
import logging
import os
import sys

from celery.schedules import crontab
from flask_caching.backends.filesystemcache import FileSystemCache

logger = logging.getLogger()

DATABASE_DIALECT = os.getenv("DATABASE_DIALECT")
DATABASE_USER = os.getenv("DATABASE_USER")
DATABASE_PASSWORD = os.getenv("DATABASE_PASSWORD")
DATABASE_HOST = os.getenv("DATABASE_HOST")
DATABASE_PORT = os.getenv("DATABASE_PORT")
DATABASE_DB = os.getenv("DATABASE_DB")

EXAMPLES_USER = os.getenv("EXAMPLES_USER")
EXAMPLES_PASSWORD = os.getenv("EXAMPLES_PASSWORD")
EXAMPLES_HOST = os.getenv("EXAMPLES_HOST")
EXAMPLES_PORT = os.getenv("EXAMPLES_PORT")
EXAMPLES_DB = os.getenv("EXAMPLES_DB")

# The SQLAlchemy connection string.
SQLALCHEMY_DATABASE_URI = (
    f"{DATABASE_DIALECT}://"
    f"{DATABASE_USER}:{DATABASE_PASSWORD}@"
    f"{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_DB}"
)

# Use environment variable if set, otherwise construct from components
# This MUST take precedence over any other configuration
SQLALCHEMY_EXAMPLES_URI = os.getenv(
    "SUPERSET__SQLALCHEMY_EXAMPLES_URI",
    (
        f"{DATABASE_DIALECT}://"
        f"{EXAMPLES_USER}:{EXAMPLES_PASSWORD}@"
        f"{EXAMPLES_HOST}:{EXAMPLES_PORT}/{EXAMPLES_DB}"
    ),
)


REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_CELERY_DB = os.getenv("REDIS_CELERY_DB", "0")
REDIS_RESULTS_DB = os.getenv("REDIS_RESULTS_DB", "1")

RESULTS_BACKEND = FileSystemCache("/app/superset_home/sqllab")

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": REDIS_RESULTS_DB,
}
DATA_CACHE_CONFIG = CACHE_CONFIG
THUMBNAIL_CACHE_CONFIG = CACHE_CONFIG


class CeleryConfig:
    broker_url = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_CELERY_DB}"
    imports = (
        "superset.sql_lab",
        "superset.tasks.scheduler",
        "superset.tasks.thumbnails",
        "superset.tasks.cache",
    )
    result_backend = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_RESULTS_DB}"
    worker_prefetch_multiplier = 1
    task_acks_late = False
    beat_schedule = {
        "reports.scheduler": {
            "task": "reports.scheduler",
            "schedule": crontab(minute="*", hour="*"),
        },
        "reports.prune_log": {
            "task": "reports.prune_log",
            "schedule": crontab(minute=10, hour=0),
        },
    }


CELERY_CONFIG = CeleryConfig

FEATURE_FLAGS = {
    "ALERT_REPORTS": True,
    "DATASET_FOLDERS": True,
    "ENABLE_EXTENSIONS": True,
    "SEMANTIC_LAYERS": True,
}
EXTENSIONS_PATH = "/app/docker/extensions"
ALERT_REPORTS_NOTIFICATION_DRY_RUN = True
WEBDRIVER_BASEURL = f"http://superset_app{os.environ.get('SUPERSET_APP_ROOT', '/')}/"  # When using docker compose baseurl should be http://superset_nginx{ENV{BASEPATH}}/  # noqa: E501
# The base URL for the email report hyperlinks.
WEBDRIVER_BASEURL_USER_FRIENDLY = (
    f"http://localhost:8888/{os.environ.get('SUPERSET_APP_ROOT', '/')}/"
)
SQLLAB_CTAS_NO_LIMIT = True


BABEL_DEFAULT_LOCALE = "ru"
LANGUAGES = {
    "ru": {"flag": "ru", "name": "Russian"},
    "en": {"flag": "us", "name": "English"},
}

log_level_text = os.getenv("SUPERSET_LOG_LEVEL", "INFO")
LOG_LEVEL = getattr(logging, log_level_text.upper(), logging.INFO)

# --- OpenClaw AI Chart (MCP) ---------------------------------------------
# One file, two contours, switched by the MCP_PROD env var so the same image
# is safe locally AND on prod. NOTHING secret is hard-coded here — the prod
# API key comes from the environment (set it in docker/.env-local or your
# deploy secrets), never committed to git.
#
#   Local test (default, MCP_PROD unset/false):
#       no lock — anyone reaching :5008 acts as admin. Safe ONLY because the
#       MCP port is not exposed to the internet on a dev machine.
#
#   Prod (MCP_PROD=true):
#       lock ON — API-key auth + RBAC. Required because Superset and OpenClaw
#       live on SEPARATE servers, so MCP must be reachable over the network.
#       See tech_docs/MCP_PROD_SETUP.md.


def _is_truthy(val: str | None) -> bool:
    return (val or "").strip().lower() in {"1", "true", "yes", "on"}


# [techpeople] Prod contour is the DEFAULT: when MCP_PROD is unset we still
# lock the MCP transport (API key + RBAC), because it is network-reachable
# (OpenClaw and Superset on separate servers). To run the relaxed local-test
# contour you must OPT OUT explicitly with MCP_PROD=false.
_MCP_PROD = _is_truthy(os.getenv("MCP_PROD", "true"))

# Tool search stays off in both contours (we pass all tools to the agent).
MCP_TOOL_SEARCH_CONFIG = {"enabled": False}

if _MCP_PROD:
    # Lock ON. The API key itself is NOT stored here — clients send it as a
    # bearer token; this only requires key auth on the MCP transport.
    FAB_API_KEY_ENABLED = True  # backend: registers the ApiKey blueprint
    # Separate frontend feature flag (same name, different setting) — gates the
    # "API Keys" panel on /user_info/. Without it the page shows user data only
    # and there is no way to create a key.
    FEATURE_FLAGS["FAB_API_KEY_ENABLED"] = True
    MCP_API_KEY_ENABLED = True
    MCP_AUTH_ENABLED = True
    MCP_RBAC_ENABLED = True
    # Browser CORS only matters if the in-browser chart path is used. For the
    # OpenClaw server-to-server path it is unused. Origin is configurable.
    MCP_CORS_ALLOWED_ORIGINS = [
        os.getenv("MCP_CORS_ORIGIN", "https://superset.techpeople.ru"),
    ]
else:
    # Dev contour: relaxed, for localhost testing only. Never reachable
    # from the internet on a dev machine.
    MCP_AUTH_ENABLED = False
    MCP_DEV_USERNAME = "admin"
    MCP_RBAC_ENABLED = False
    MCP_CORS_ALLOWED_ORIGINS = ["http://localhost:8088"]

if os.getenv("CYPRESS_CONFIG") == "true":
    # When running the service as a cypress backend, we need to import the config
    # located @ tests/integration_tests/superset_test_config.py
    base_dir = os.path.dirname(__file__)
    module_folder = os.path.abspath(
        os.path.join(base_dir, "../../tests/integration_tests/")
    )
    sys.path.insert(0, module_folder)
    from superset_test_config import *  # noqa

    sys.path.pop(0)

# Handlebars charts: allow inline bar styling. Default sanitizer strips `style`
# and `width`; extend the schema so progress-bars can set fill width. Loosens
# XSS protection for HTML/Markdown/Handlebars charts.
HTML_SANITIZATION_SCHEMA_EXTENSIONS = {
    "attributes": {
        "*": ["style", "class"],
    },
    "css": {
        "properties": {
            "width": True,
            "height": True,
            "background-color": True,
            "border-radius": True,
        },
    },
}

#
# Optionally import superset_config_docker.py (which will have been included on
# the PYTHONPATH) in order to allow for local settings to be overridden
#
try:
    import superset_config_docker
    from superset_config_docker import *  # noqa: F403

    logger.info(
        "Loaded your Docker configuration at [%s]", superset_config_docker.__file__
    )
except ImportError:
    logger.info("Using default Docker config...")
