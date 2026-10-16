"""Regressions for directory/index redirects observed on production."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "doc_versions", Path(__file__).resolve().parents[1] / "check-doc-versions.py"
)
doc_versions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(doc_versions)


class DocumentationRedirectTests(unittest.TestCase):
    def test_reported_section_index_redirects_are_rejected(self):
        for locale in ("en", "es"):
            for version in ("1.57", "1.58"):
                for section in ("operator-manual", "changelog"):
                    path = f"/{locale}/v{version}/{section}"
                    with self.subTest(path=path):
                        with self.assertRaisesRegex(AssertionError, "Self redirect"):
                            doc_versions.validate_normalized_redirects({path + "/index": path})

    def test_directory_and_index_bookmarks_can_share_overview(self):
        doc_versions.validate_normalized_redirects({
            "/en/v1.57/changelog": "/en/v1.57/changelog/overview",
            "/en/v1.57/changelog/index": "/en/v1.57/changelog/overview",
        })

    def test_conflicting_directory_aliases_are_rejected(self):
        with self.assertRaisesRegex(AssertionError, "Conflicting normalized"):
            doc_versions.validate_normalized_redirects({
                "/guide/": "/first",
                "/guide/index": "/second",
            })

    def test_cycle_hidden_by_index_and_trailing_slash_is_rejected(self):
        with self.assertRaisesRegex(AssertionError, "chain or cycle"):
            doc_versions.validate_normalized_redirects({
                "/old/index": "/new",
                "/new/": "/old",
            })


if __name__ == "__main__":
    unittest.main()
