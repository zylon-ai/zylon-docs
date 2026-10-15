#!/usr/bin/env python3
"""Check that navigation, links, snippets, and API specs stay in their version."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = "v1.58/"


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


def main():
    config = json.loads((ROOT / "docs.json").read_text())
    versions = config["navigation"]["versions"]
    assert versions[0]["version"] == "1.57" and versions[0]["default"] is True
    assert versions[1]["version"] == "1.58 (Upcoming release)"
    counts = []
    for version, upcoming in zip(versions, (False, True)):
        references = list(pages(version))
        for page in references:
            assert any(page.startswith(lang + ("/v1.58/" if upcoming else "/v1.57/")) for lang in ("en", "es")), page
            if not upcoming:
                assert "/v1.58/" not in page, page
            assert (ROOT / (page + ".mdx")).is_file(), ("Navigation must match the canonical source filename", page)
        expected = {
            path.relative_to(ROOT).as_posix().removesuffix(".mdx").removesuffix("/index")
            for lang in ("en", "es")
            for path in (ROOT / lang / ("v1.58" if upcoming else "v1.57")).rglob("*.mdx")
            if upcoming or "/v1.58/" not in path.relative_to(ROOT).as_posix()
        }
        assert not (expected - set(references)), ("Unregistered pages lose version context", expected - set(references))
        for lang in ("en", "es"):
            base = lang + ("/v1.58" if upcoming else "/v1.57")
            home = (ROOT / base / "overview.mdx").read_text()
            assert f'href="/{base}/developer-manual/get-started/intro-to-zylon"' in home, base
        assert len(references) == len(set(references)), "Duplicate canonical navigation references"
        assert not any(page.endswith("/index") for page in references), "Navigation must use canonical paths"
        counts.append(len(references))

    relative_pages = [{re.sub(r"/v1\.5[78]/", "/", page) for page in pages(v)} for v in versions]
    assert relative_pages[0] == relative_pages[1], "Every page needs an equivalent article or availability page"

    preview_pages = [path for lang in ("en", "es") for path in (ROOT / lang / "v1.58").rglob("*.mdx")]
    snippets = list((ROOT / "snippets" / PREVIEW).rglob("*.mdx"))
    for path in preview_pages + snippets:
        text = path.read_text()
        # Notices and historical upgrade guides explicitly identify their stable target.
        if path.name == "1-57-0.mdx":
            lang = path.relative_to(ROOT).parts[0]
            stable_presets = f"/{lang}/v1.57/operator-manual/ai-presets/presets"
            assert stable_presets in text, path
            text = text.replace(stable_presets, f"/{lang}/v1.58/operator-manual/ai-presets/presets")
        if path.name != "upcoming-release.mdx":
            assert not re.search(r'\]\(/(?:en|es)(?:/(?!v1\.58/)|\))|href=["\']/(?:en|es)/(?!v1\.58/)', text), path
        if path in preview_pages:
            assert "<UpcomingRelease />" in text, path
        for snippet in re.findall(r'from ["\'](/snippets/[^"\']+)["\']', text):
            assert snippet.startswith("/snippets/" + PREVIEW), (path, snippet)
            assert (ROOT / snippet.lstrip("/")).is_file(), (path, snippet)

    redirects = {entry["source"]: entry["destination"] for entry in config["redirects"]}
    assert len(redirects) == len(config["redirects"]), "Duplicate redirect sources"
    for source, destination in redirects.items():
        assert destination not in redirects, ("Redirect chain", source, destination)
        target = ROOT / destination.lstrip("/")
        assert target.with_suffix(".mdx").is_file() or (target / "index.mdx").is_file(), (source, destination)
    for lang in ("en", "es"):
        for path in (ROOT / lang / "v1.57").rglob("*.mdx"):
            relative = path.relative_to(ROOT / lang / "v1.57").as_posix().removesuffix(".mdx")
            old = "/" + lang + "/" + relative
            if "version-availability" in path.read_text():
                assert redirects.get(old) == old.replace("/" + lang + "/", "/" + lang + "/v1.58/", 1), old
            else:
                assert redirects.get(old, "").startswith("/" + lang + "/v1.57/"), old

    for prefix in ("", PREVIEW):
        for name in ("workspace", "pgpt"):
            spec = json.loads((ROOT / prefix / "api-reference" / (name + ".json")).read_text())
            assert "openapi" in spec and "paths" in spec, (prefix, name)
    print(f"OK: {counts[0]} stable / {counts[1]} upcoming navigation entries; "
          f"{len(preview_pages)} preview pages, {len(snippets)} snippets, four API specs; {len(redirects)} redirects.")


if __name__ == "__main__":
    main()
