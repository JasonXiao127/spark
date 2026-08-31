"""Test configuration.

These env vars MUST be set before any backend module is imported:
- main.py refuses to start without an API key of >= 32 characters.
- database.py creates its data directory (and the sqlite file) relative to
  LANTERN_DB_PATH at import time, so tests point it at a temp dir to avoid
  touching a real database.
"""

import os
import tempfile

import pytest

os.environ["LANTERN_API_KEY"] = "conftest-test-key-0123456789abcdef"  # 34 chars
os.environ["LANTERN_DB_PATH"] = os.path.join(
    tempfile.mkdtemp(prefix="lantern-tests-"), "lantern-test.db"
)


@pytest.fixture(autouse=True)
def _clean_database():
    """Give every test an empty devices table."""
    import database

    database.Base.metadata.create_all(bind=database.engine)
    yield
    with database.engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM devices")