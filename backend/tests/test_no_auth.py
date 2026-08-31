"""Tests for no-auth mode: a blank LANTERN_API_KEY disables authentication."""

import importlib
import os

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture()
def no_auth_client():
    """Reload main with a blank key, restore the original state afterwards."""
    original = os.environ["LANTERN_API_KEY"]
    os.environ["LANTERN_API_KEY"] = ""
    try:
        reloaded = importlib.reload(main)
        assert reloaded.AUTH_DISABLED is True
        yield TestClient(reloaded.app)
    finally:
        os.environ["LANTERN_API_KEY"] = original
        importlib.reload(main)


def test_no_auth_allows_requests_without_header(no_auth_client):
    response = no_auth_client.get("/api/devices")
    assert response.status_code == 200
    assert response.json() == []


def test_no_auth_ignores_any_header_value(no_auth_client):
    for headers in ({"X-API-Key": "x" * 40}, {"X-API-Key": "anything"}):
        response = no_auth_client.get("/api/devices", headers=headers)
        assert response.status_code == 200


def test_no_auth_allows_mutations(no_auth_client):
    response = no_auth_client.post(
        "/api/devices", json={"name": "PC", "mac_address": "02:00:00:00:00:01"}
    )
    assert response.status_code == 201


def test_auth_restored_after_no_auth_fixture():
    # The fixture must restore the keyed instance for the other test modules.
    import main as current

    assert current.AUTH_DISABLED is False
