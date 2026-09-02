import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_catalog

class BuildCatalogTests(unittest.TestCase):
    def make_app(self, root, slug, **overrides):
        app_dir = root / 'apps' / slug
        app_dir.mkdir(parents=True)
        meta = {
            'id': slug,
            'name': slug.title(),
            'description': 'desc',
            'category': 'Office',
            'entry': 'index.html',
            'icon': '',
            'version': '1.0.0',
            'featured': False,
            'publishedAt': '2026-09-02T00:00:00.000Z',
            'updatedAt': '2026-09-02T00:00:00.000Z',
        }
        meta.update(overrides)
        (app_dir / 'index.html').write_text('<!doctype html>', encoding='utf-8')
        (app_dir / 'app.meta.json').write_text(json.dumps(meta), encoding='utf-8')
        return app_dir

    def test_build_catalog_computes_paths_and_sorts_featured_first(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.make_app(root, 'alpha', name='Alpha')
            self.make_app(root, 'beta', name='Beta', featured=True, icon='icon.svg')
            (root / 'apps' / 'beta' / 'icon.svg').write_text('<svg/>', encoding='utf-8')
            catalog = build_catalog.build_catalog(root)
            self.assertEqual([x['id'] for x in catalog['apps']], ['beta', 'alpha'])
            self.assertEqual(catalog['apps'][0]['launchPath'], 'apps/beta/index.html')
            self.assertEqual(catalog['apps'][0]['iconPath'], 'apps/beta/icon.svg')

    def test_invalid_metadata_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.make_app(root, 'alpha', entry='../bad.html')
            with self.assertRaises(ValueError):
                build_catalog.build_catalog(root)

    def test_missing_entry_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.make_app(root, 'alpha', entry='missing.html')
            with self.assertRaises(ValueError):
                build_catalog.build_catalog(root)

    def test_write_catalog_is_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.make_app(root, 'alpha', name='Alpha')
            out = root / 'data' / 'catalog.json'
            build_catalog.write_catalog(root, out)
            first = out.read_bytes()
            build_catalog.write_catalog(root, out)
            second = out.read_bytes()
            self.assertEqual(first, second)
            self.assertTrue(first.endswith(b'\n'))

if __name__ == '__main__':
    unittest.main()
