"""Guard released navigation and prevent retired pre-release notices returning."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "doc_versions", Path(__file__).resolve().parents[1] / "check-doc-versions.py"
)
doc_versions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(doc_versions)


class DocumentationReleaseTests(unittest.TestCase):
    def test_released_default_is_first_for_mintlify_root_navigation(self):
        doc_versions.validate_releases([
            {"version": "1.58", "default": True}, {"version": "1.57"},
        ])
        with self.assertRaisesRegex(AssertionError, "must be first"):
            doc_versions.validate_releases([
                {"version": "1.57"}, {"version": "1.58", "default": True},
            ])

    def test_invalid_labels_and_defaults_are_rejected(self):
        for versions in (
            [{"version": "1.57", "default": True}, {"version": "1.58"}],
            [{"version": "1.57", "default": True}, {"version": "1.58", "default": True}],
            [{"version": "1.57"}, {"version": "1.58"}],
            [{"version": "1.57"}, {"version": "1.58 (Upcoming release)", "default": True}],
        ):
            with self.subTest(versions=versions), self.assertRaises(AssertionError):
                doc_versions.validate_releases(versions)

    def test_retired_notices_and_localized_prose_are_rejected(self):
        for text in ("<UpcomingRelease />", 'import Notice from "/snippets/v1.58/en/upcoming-release.mdx"',
                     "Upcoming release", "the upcoming guide", "Próxima versión"):
            with self.subTest(text=text), self.assertRaisesRegex(AssertionError, "pre-release notices"):
                doc_versions.validate_published_content(text, "fixture.mdx")
        doc_versions.validate_published_content("Read the 1.58 API migration guide.", "fixture.mdx")


if __name__ == "__main__":
    unittest.main()
