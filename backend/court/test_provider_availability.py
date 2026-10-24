"""
Unit tests for OllamaProvider availability checks (Task 2d).

Tests exact match, "gemma3" vs installed "gemma3:latest",
different size not matching, and Ollama unreachable.
"""

from unittest.mock import patch, Mock
import requests
import pytest

from backend.court.providers.ollama import OllamaProvider


def test_availability_exact_match():
    """Exact model name matches installed model."""
    provider = OllamaProvider(base_url="http://localhost:11434", model="gemma3:4b")

    mock_resp = Mock()
    mock_resp.json.return_value = {
        "models": [{"name": "gemma3:4b"}]
    }
    mock_resp.raise_for_status = Mock()

    with patch("requests.get", return_value=mock_resp):
        reachable, model_ok, msg = provider.availability_detail()
        assert reachable is True
        assert model_ok is True
        assert provider.is_available() is True
        assert "ready" in msg.lower()


def test_availability_bare_name_vs_latest():
    """Configured 'gemma3' matches installed 'gemma3:latest'."""
    provider = OllamaProvider(base_url="http://localhost:11434", model="gemma3")

    mock_resp = Mock()
    mock_resp.json.return_value = {
        "models": [{"name": "gemma3:latest"}]
    }
    mock_resp.raise_for_status = Mock()

    with patch("requests.get", return_value=mock_resp):
        reachable, model_ok, msg = provider.availability_detail()
        assert reachable is True
        assert model_ok is True
        assert provider.is_available() is True


def test_availability_different_size_not_matching():
    """Configured 'gemma3:4b' does NOT match 'gemma3:2b' or 'gemma3:8b'."""
    provider = OllamaProvider(base_url="http://localhost:11434", model="gemma3:4b")

    mock_resp = Mock()
    mock_resp.json.return_value = {
        "models": [{"name": "gemma3:2b"}, {"name": "gemma3:8b"}]
    }
    mock_resp.raise_for_status = Mock()

    with patch("requests.get", return_value=mock_resp):
        reachable, model_ok, msg = provider.availability_detail()
        assert reachable is True
        assert model_ok is False
        assert provider.is_available() is False
        assert "ollama pull gemma3:4b" in msg


def test_availability_bare_name_does_not_match_other_tags():
    """Configured 'gemma3' does NOT loosely match 'gemma3:4b'."""
    provider = OllamaProvider(base_url="http://localhost:11434", model="gemma3")

    mock_resp = Mock()
    mock_resp.json.return_value = {
        "models": [{"name": "gemma3:4b"}]
    }
    mock_resp.raise_for_status = Mock()

    with patch("requests.get", return_value=mock_resp):
        reachable, model_ok, msg = provider.availability_detail()
        assert reachable is True
        assert model_ok is False
        assert provider.is_available() is False


def test_availability_ollama_unreachable():
    """Ollama connection failure returns unreachable with serve suggestion."""
    provider = OllamaProvider(base_url="http://localhost:11434", model="gemma3:4b")

    with patch("requests.get", side_effect=requests.exceptions.ConnectionError("Connection refused")):
        reachable, model_ok, msg = provider.availability_detail()
        assert reachable is False
        assert model_ok is False
        assert provider.is_available() is False
        assert "ollama serve" in msg
