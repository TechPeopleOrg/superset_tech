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

"""Pure string operations for named MCP CSS blocks.

An MCP block is a fragment of CSS wrapped in comment markers so that MCP
tools can update or remove *their own* additions idempotently without
touching hand-written CSS or other blocks.
"""

import re

MARKER_START_TMPL = "/* mcp:block:{name}:start */"
MARKER_END_TMPL = "/* mcp:block:{name}:end */"

# Match a whole block (markers + body) for a given, already-escaped name.
_BLOCK_RE_TMPL = (
    r"[ \t]*/\* mcp:block:{name}:start \*/.*?"
    r"/\* mcp:block:{name}:end \*/[ \t]*\n?"
)
# Capture block names from any start marker.
_ANY_BLOCK_NAME_RE = re.compile(r"/\* mcp:block:(?P<name>.+?):start \*/")


def _block_re(name: str) -> "re.Pattern[str]":
    return re.compile(
        _BLOCK_RE_TMPL.format(name=re.escape(name)),
        re.DOTALL,
    )


def find_blocks(css: str | None) -> list[str]:
    """Return names of all MCP blocks, in order of appearance."""
    if not css:
        return []
    return _ANY_BLOCK_NAME_RE.findall(css)


def upsert_block(css: str | None, name: str, fragment: str) -> tuple[str, str]:
    """Insert, replace, or remove a named MCP block.

    Empty/whitespace ``fragment`` removes the block. Returns
    ``(new_css, action)`` where action is created|updated|removed.
    """
    base = css or ""
    exists = bool(_block_re(name).search(base))

    if not fragment or not fragment.strip():
        new_css = _block_re(name).sub("", base) if exists else base
        return new_css.rstrip() + ("\n" if new_css.strip() else ""), "removed"

    block = (
        f"{MARKER_START_TMPL.format(name=name)}\n"
        f"{fragment.strip()}\n"
        f"{MARKER_END_TMPL.format(name=name)}\n"
    )

    if exists:
        new_css = _block_re(name).sub(block, base)
        return new_css, "updated"

    prefix = base.rstrip()
    joined = f"{prefix}\n\n{block}" if prefix else block
    return joined, "created"


def remove_all_blocks(css: str | None) -> str:
    """Remove every MCP block, leaving foreign CSS intact."""
    base = css or ""
    for name in find_blocks(base):
        base = _block_re(name).sub("", base)
    return base.rstrip() + ("\n" if base.strip() else "")
