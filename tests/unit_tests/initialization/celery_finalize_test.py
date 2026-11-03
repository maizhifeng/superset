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

"""Regression coverage for finalizing the Celery app during app initialization.

``@celery_app.task`` returns a lazy ``celery.local.PromiseProxy`` while the app
is unfinalized, and resolving that proxy is not thread-safe: Celery publishes
the task in ``App._tasks`` before ``Task.bind()`` installs the class-level
``request_stack``. On a cold web worker the first concurrent requests could
therefore observe a registered-but-unbound task and fail in
``Task.push_request`` with ``AttributeError: 'NoneType' object has no attribute
'push'``. ``SupersetAppInitializer.configure_celery()`` is expected to finalize
the app so request handling never resolves a lazy task proxy.
"""

import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent
from unittest.mock import patch

from superset.app import SupersetApp
from superset.config import CeleryConfig
from superset.extensions import celery_app
from superset.initialization import SupersetAppInitializer

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_configure_celery_finalizes_app_after_task_base_is_installed() -> None:
    """``configure_celery`` finalizes the app with ``AppContextTask`` in place.

    Finalizing before ``celery_app.Task = AppContextTask`` would build the
    pending/lazily imported task classes on the plain Celery ``Task`` base, so
    the ordering is asserted along with the finalize itself.
    """
    app = SupersetApp(__name__)
    app.config["CELERY_CONFIG"] = CeleryConfig
    initializer = SupersetAppInitializer(app)

    original_task_base = celery_app.Task
    original_finalize = celery_app.finalize
    finalize_calls: list[type] = []

    def spy_finalize(*args, **kwargs):
        finalize_calls.append(celery_app.Task)
        return original_finalize(*args, **kwargs)

    try:
        with patch.object(celery_app, "finalize", side_effect=spy_finalize):
            initializer.configure_celery()
    finally:
        # configure_celery installs a fresh AppContextTask subclass; restore
        # the previous base so later tests keep using their initialized app.
        celery_app.Task = original_task_base

    assert finalize_calls, "configure_celery() must finalize the Celery app"
    assert finalize_calls[0].__name__ == "AppContextTask"
    assert celery_app.finalized is True


def test_create_app_finalizes_celery_app_and_binds_tasks() -> None:
    """A freshly booted process must not expose lazy Celery task proxies.

    Runs ``create_app()`` in a subprocess so the assertion observes the same
    cold-start state as a web worker, independent of what other tests already
    imported (task proxies are created at decoration time and are only
    resolved once the app is finalized).
    """
    script = dedent(
        """
        from celery.local import PromiseProxy

        from superset.app import create_app

        create_app()

        from superset.extensions import celery_app
        from superset.sql_lab import get_sql_results

        assert celery_app.finalized is True, (
            "create_app() left the Celery app unfinalized; @celery_app.task "
            "results stay lazy proxies whose first resolution is not "
            "thread-safe"
        )
        assert not celery_app._pending, (
            f"unresolved task proxies after app initialization: "
            f"{list(celery_app._pending)}"
        )
        assert not isinstance(get_sql_results, PromiseProxy), (
            "superset.sql_lab.get_sql_results is still a lazy PromiseProxy"
        )
        assert get_sql_results.request_stack is not None, (
            "superset.sql_lab.get_sql_results is registered but not bound "
            "(request_stack is None)"
        )
        unbound = sorted(
            name
            for name, task in celery_app._tasks.items()
            if task.request_stack is None
        )
        assert not unbound, f"registered-but-unbound tasks: {unbound}"
        """
    )
    env = {
        **os.environ,
        "SUPERSET_TESTENV": "true",
        # Keep the check independent of whatever metadata database the caller's
        # environment points at; app creation only needs a connectable engine.
        "SUPERSET__SQLALCHEMY_DATABASE_URI": "sqlite://",
    }
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", script],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )

    assert result.returncode == 0, (
        "Celery app initialization invariant failed in a fresh process:\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
