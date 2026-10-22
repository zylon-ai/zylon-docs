#!/usr/bin/env python3
"""Check that navigation, links, and snippets stay in their version."""
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RELEASES = ("1.57", "1.58")
DEFAULT_RELEASE = "1.58"
RELEASE_NOTICE = re.compile(
    r"UpcomingRelease|upcoming-release|upcoming (?:release|version|documentation|guide)|próxima versión",
    re.IGNORECASE,
)
SECTION_LANDINGS = {
    "changelog", "operator-manual", "operator-manual/configuration",
    "operator-manual/configuration/features", "operator-manual/configuration/observability",
    "operator-manual/installation", "operator-manual/instance-hardening",
    "operator-manual/knowledge-base", "operator-manual/auditability-ai-safety",
}


def pages(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "pages":
                for item in value:
                    if isinstance(item, str):
                        yield item
                    else:
                        yield from pages(item)
            else:
                yield from pages(value)
    elif isinstance(node, list):
        for item in node:
            yield from pages(item)


def validate_releases(versions):
    labels = [version["version"] for version in versions]
    assert len(labels) == len(set(labels)) and set(labels) == set(RELEASES), ("Unexpected release labels", labels)
    defaults = [version["version"] for version in versions if version.get("default") is True]
    assert defaults == [DEFAULT_RELEASE], ("Incorrect default release", defaults)
    assert labels[0] == DEFAULT_RELEASE, "Default release must be first for Mintlify root navigation"


def validate_published_content(text, path):
    assert not RELEASE_NOTICE.search(text), ("Published docs must not contain pre-release notices", path)


def normalize_redirect_path(value):
    """Mintlify production treats a terminal /index as its directory path."""
    path = unquote(urlsplit(value).path).rstrip("/") or "/"
    return path.removesuffix("/index") or "/"


def validate_normalized_redirects(redirects):
    normalized = {}
    for source, destination in redirects.items():
        source_path = normalize_redirect_path(source)
        target_path = normalize_redirect_path(destination)
        assert source_path != target_path, ("Self redirect after path normalization", source, destination)
        if source_path in normalized:
            assert normalized[source_path] == target_path, ("Conflicting normalized redirect sources", source)
        normalized[source_path] = target_path
    for source, destination in normalized.items():
        assert destination not in normalized, ("Normalized redirect chain or cycle", source, destination)


def main():
    config = json.loads((ROOT / "docs.json").read_text())
    navigation = config["navigation"]
    if "products" in navigation:
        navigation = next(product for product in navigation["products"] if product["product"] == "Zylon")
    versions = navigation["versions"]
    validate_releases(versions)
    counts = {}
    for version in versions:
        release = version["version"]
        slug = "v" + release
        references = list(pages(version))
        for page in references:
            assert any(page.startswith(f"{lang}/{slug}/") for lang in ("en", "es")), page
            assert (ROOT / (page + ".mdx")).is_file(), ("Navigation must match the canonical source filename", page)
        expected = {
            path.relative_to(ROOT).as_posix().removesuffix(".mdx").removesuffix("/index")
            for lang in ("en", "es")
            for path in (ROOT / lang / slug).rglob("*.mdx")
        }
        assert not (expected - set(references)), ("Unregistered pages lose version context", expected - set(references))
        for lang in ("en", "es"):
            base = f"{lang}/{slug}"
            home = (ROOT / base / "overview.mdx").read_text()
            assert f'href="/{base}/developer-manual/get-started/intro-to-zylon"' in home, base
            for path in (ROOT / base).rglob("*.mdx"):
                validate_published_content(path.read_text(), path)
        assert len(references) == len(set(references)), "Duplicate canonical navigation references"
        assert not any(page.endswith("/index") for page in references), "Navigation must use canonical paths"
        counts[release] = len(references)

    relative_pages = [{page.replace(f"/v{v['version']}/", "/", 1) for page in pages(v)} for v in versions]
    assert all(relative == relative_pages[0] for relative in relative_pages), "Every page needs an equivalent article or availability page"

    current_slug = "v" + DEFAULT_RELEASE
    current_pages = [path for lang in ("en", "es") for path in (ROOT / lang / current_slug).rglob("*.mdx")]
    snippets = list((ROOT / "snippets" / current_slug).rglob("*.mdx"))
    for path in current_pages + snippets:
        text = path.read_text()
        validate_published_content(text, path)
        # Historical upgrade guides explicitly identify their frozen target release.
        if path.name == "1-57-0.mdx":
            lang = path.relative_to(ROOT).parts[0]
            stable_presets = f"/{lang}/v1.57/operator-manual/ai-presets/presets"
            assert stable_presets in text, path
            text = text.replace(stable_presets, f"/{lang}/{current_slug}/operator-manual/ai-presets/presets")
        assert not re.search(r'\]\(/(?:en|es)(?:/(?!' + re.escape(current_slug) + r'/)|\))|href=["\']/(?:en|es)/(?!' + re.escape(current_slug) + r'/)', text), path
        for snippet in re.findall(r'from ["\'](/snippets/[^"\']+)["\']', text):
            assert snippet.startswith(f"/snippets/{current_slug}/"), (path, snippet)
            assert (ROOT / snippet.lstrip("/")).is_file(), (path, snippet)

    redirects = {entry["source"]: entry["destination"] for entry in config["redirects"]}
    assert len(redirects) == len(config["redirects"]), "Duplicate redirect sources"
    validate_normalized_redirects(redirects)
    for lang in ("en", "es"):
        for release in RELEASES:
            for section in SECTION_LANDINGS:
                old = f"/{lang}/v{release}/{section}"
                for source in (old, old + "/index"):
                    assert redirects.get(source) == old + "/overview", ("Section bookmark must reach its overview", source)
    for source, destination in redirects.items():
        target = ROOT / destination.lstrip("/")
        assert target.with_suffix(".mdx").is_file() or (target / "index.mdx").is_file(), (source, destination)
    for lang in ("en", "es"):
        for path in (ROOT / lang / "v1.57").rglob("*.mdx"):
            relative = path.relative_to(ROOT / lang / "v1.57").as_posix().removesuffix(".mdx")
            legacy = relative.removesuffix("/overview")
            if legacy not in SECTION_LANDINGS:
                legacy = relative
            old = "/" + lang + "/" + legacy
            if "version-availability" in path.read_text():
                assert redirects.get(old) == old.replace("/" + lang + "/", "/" + lang + "/v1.58/", 1), old
            else:
                assert redirects.get(old, "").startswith("/" + lang + "/v1.57/"), old

    entries = ", ".join(f"{release}: {counts[release]}" for release in RELEASES)
    print(f"OK: navigation entries ({entries}); default {DEFAULT_RELEASE}; "
          f"{len(current_pages)} current pages, {len(snippets)} snippets; {len(redirects)} redirects.")


if __name__ == "__main__":
    main()
