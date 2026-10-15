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
    versions = json.loads((ROOT / "docs.json").read_text())["navigation"]["versions"]
    assert versions[0]["version"] == "1.57" and versions[0]["default"] is True
    assert versions[1]["version"] == "1.58 (Upcoming release)"
    counts = []
    for version, upcoming in zip(versions, (False, True)):
        references = list(pages(version))
        for page in references:
            assert any(page.startswith(lang + ("/v1.58/" if upcoming else "/")) for lang in ("en", "es")), page
            if not upcoming:
                assert "/v1.58/" not in page, page
            assert (ROOT / (page + ".mdx")).is_file() or (ROOT / page / "index.mdx").is_file(), page
        counts.append(len(references))

    preview_pages = [path for lang in ("en", "es") for path in (ROOT / lang / "v1.58").rglob("*.mdx")]
    snippets = list((ROOT / "snippets" / PREVIEW).rglob("*.mdx"))
    for path in preview_pages + snippets:
        text = path.read_text()
        # The notice intentionally links back to stable documentation.
        if path.name != "upcoming-release.mdx":
            assert not re.search(r'\]\(/(?:en|es)(?:/(?!v1\.58/)|\))|href=["\']/(?:en|es)/(?!v1\.58/)', text), path
        if path in preview_pages:
            assert "<UpcomingRelease />" in text, path
        for snippet in re.findall(r'from ["\'](/snippets/[^"\']+)["\']', text):
            assert snippet.startswith("/snippets/" + PREVIEW), (path, snippet)
            assert (ROOT / snippet.lstrip("/")).is_file(), (path, snippet)

    for prefix in ("", PREVIEW):
        for name in ("workspace", "pgpt"):
            spec = json.loads((ROOT / prefix / "api-reference" / (name + ".json")).read_text())
            assert "openapi" in spec and "paths" in spec, (prefix, name)
    print(f"OK: {counts[0]} stable / {counts[1]} upcoming navigation entries; "
          f"{len(preview_pages)} preview pages, {len(snippets)} snippets, four API specs.")


if __name__ == "__main__":
    main()
