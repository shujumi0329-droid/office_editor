#!/usr/bin/env python3
import argparse
import json
from pathlib import Path, PurePosixPath


def safe_relative_path(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{label} must be a non-empty string')
    if '\\' in value or value.startswith('/') or '\x00' in value:
        raise ValueError(f'unsafe {label}: {value}')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or (path.parts and ':' in path.parts[0]):
        raise ValueError(f'unsafe {label}: {value}')
    return path.as_posix()


def load_meta(meta_path):
    try:
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f'invalid metadata {meta_path}: {exc}') from exc
    if not isinstance(meta, dict):
        raise ValueError(f'metadata must be an object: {meta_path}')
    for key in ('id', 'name', 'entry'):
        if not isinstance(meta.get(key), str) or not meta[key].strip():
            raise ValueError(f'{meta_path}: missing {key}')
    return meta


def record_for_app(root, app_dir):
    meta_path = app_dir / 'app.meta.json'
    meta = load_meta(meta_path)
    slug = app_dir.name
    if meta['id'] != slug:
        raise ValueError(f'{meta_path}: id must match directory name {slug}')
    entry = safe_relative_path(meta['entry'], 'entry')
    if not (app_dir / entry).is_file():
        raise ValueError(f'{meta_path}: entry does not exist: {entry}')
    icon = meta.get('icon') or ''
    if icon:
        icon = safe_relative_path(icon, 'icon')
        if not (app_dir / icon).is_file():
            raise ValueError(f'{meta_path}: icon does not exist: {icon}')
    return {
        'id': meta['id'],
        'name': meta['name'],
        'description': meta.get('description', ''),
        'category': meta.get('category', 'Office'),
        'version': meta.get('version', '1.0.0'),
        'featured': bool(meta.get('featured', False)),
        'entry': entry,
        'icon': icon,
        'publishedAt': meta.get('publishedAt', ''),
        'updatedAt': meta.get('updatedAt', ''),
        'launchPath': f'apps/{slug}/{entry}',
        'iconPath': f'apps/{slug}/{icon}' if icon else '',
    }


def build_catalog(root):
    root = Path(root)
    apps_dir = root / 'apps'
    records = []
    if apps_dir.exists():
        for meta_path in sorted(apps_dir.glob('*/app.meta.json')):
            records.append(record_for_app(root, meta_path.parent))
    records.sort(key=lambda item: (not item['featured'], item['name'].casefold(), item['id']))
    return {'schemaVersion': 1, 'apps': records}


def write_catalog(root, output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(build_catalog(root), ensure_ascii=False, indent=2) + '\n'
    output.write_text(payload, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description='Rebuild Torsio Office Deck catalog.json')
    parser.add_argument('--root', default='.', help='Repository root')
    parser.add_argument('--output', default='data/catalog.json', help='Catalog output path')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    output = Path(args.output)
    if not output.is_absolute():
        output = root / output
    write_catalog(root, output)
    print(f'Wrote {output}')


if __name__ == '__main__':
    main()
