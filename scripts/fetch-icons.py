"""Download skill and item icons into app/icons/ so the app works offline.

Icons are served by the gamers4.life database at /icons/<game asset path>.webp.
Already-downloaded files are skipped. Run: python3 scripts/fetch-icons.py
"""
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data-src'
OUT = ROOT / 'app' / 'icons'
BASE = 'https://gamers4.life/aion-2/database/icons/'


def icon_name(path):
    """'/assets/.../Skill/ICON_X.ICON_X' -> 'ICON_X' (the file name used in app/icons)."""
    return path.rstrip('/').rsplit('/', 1)[-1].split('.', 1)[0]


def icon_url(path):
    p = path.lstrip('/')
    folder, _, file = p.rpartition('/')
    return BASE + (folder + '/' if folder else '') + file.split('.', 1)[0] + '.webp'


def all_paths():
    paths = set(json.loads((SRC / 'item-icons.json').read_text()).values())
    for c in ('assassin', 'ranger'):
        d = json.loads((SRC / f'skills-{c}.json').read_text())
        paths.update(s['iconPath'] for s in d['skills'] + d['commonSkills'] if s.get('iconPath'))
    return sorted(paths)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    paths = all_paths()
    names = {}
    for p in paths:
        names.setdefault(icon_name(p), set()).add(p)
    clashes = {n: ps for n, ps in names.items() if len(ps) > 1}
    if clashes:
        raise SystemExit(f'icon name clashes: {list(clashes.items())[:3]}')
    ok = skipped = failed = 0
    for p in paths:
        dest = OUT / (icon_name(p) + '.webp')
        if dest.exists():
            skipped += 1
            continue
        try:
            req = urllib.request.Request(icon_url(p), headers={'User-Agent': 'aion2-build-planner icon sync'})
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.headers.get_content_type() != 'image/webp':
                    raise ValueError(r.headers.get_content_type())
                dest.write_bytes(r.read())
            ok += 1
        except Exception as e:  # keep going; the app falls back to initials
            failed += 1
            print('failed', p, e)
        time.sleep(0.15)
    print(f'downloaded {ok}, already had {skipped}, failed {failed}')


main()
