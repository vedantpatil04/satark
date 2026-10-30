import json
import os
import pytest

EXTENSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def test_manifest_v3_structure():
    """Validates manifest.json conforms to Chromium Manifest V3 specifications"""
    manifest_path = os.path.join(EXTENSION_DIR, "manifest.json")
    assert os.path.exists(manifest_path), "manifest.json must exist"

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("manifest_version") == 3
    assert manifest.get("name") == "SATARK Exam Integrity Companion"
    assert "tabs" in manifest.get("permissions", [])
    assert "storage" in manifest.get("permissions", [])

    # Check background service worker exists
    sw_rel = manifest.get("background", {}).get("service_worker")
    assert sw_rel, "Background service worker must be specified"
    sw_path = os.path.join(EXTENSION_DIR, sw_rel)
    assert os.path.exists(sw_path), f"Service worker file missing: {sw_path}"

    # Check popup files exist
    popup_rel = manifest.get("action", {}).get("default_popup")
    assert popup_rel, "Action popup must be specified"
    popup_path = os.path.join(EXTENSION_DIR, popup_rel)
    assert os.path.exists(popup_path), f"Popup HTML file missing: {popup_path}"

    # Check content script exists
    content_scripts = manifest.get("content_scripts", [])
    assert len(content_scripts) > 0
    for cs in content_scripts:
        for js_file in cs.get("js", []):
            cs_path = os.path.join(EXTENSION_DIR, js_file)
            assert os.path.exists(cs_path), f"Content script file missing: {cs_path}"


def test_popup_and_shared_assets():
    """Validates presence and syntax of extension popup and shared assets"""
    popup_css = os.path.join(EXTENSION_DIR, "popup", "popup.css")
    popup_js = os.path.join(EXTENSION_DIR, "popup", "popup.js")
    rules_js = os.path.join(EXTENSION_DIR, "shared", "rules.js")

    assert os.path.exists(popup_css)
    assert os.path.exists(popup_js)
    assert os.path.exists(rules_js)

    with open(rules_js, "r", encoding="utf-8") as f:
        content = f.read()
        assert "chatgpt.com" in content
        assert "DEFAULT_RESTRICTED_DOMAINS" in content

