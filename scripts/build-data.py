"""Validate the reviewed catalog and create the dependency-free browser data file."""
import json
import pathlib
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
clubs = json.loads((ROOT / 'data/catalog.json').read_text())
assert isinstance(clubs, list) and clubs, 'Catalog must be a non-empty list'
ids = set()
categories = {'driver', 'fairway', 'hybrid', 'iron', 'wedge', 'putter'}
for club in clubs:
    assert club['id'] not in ids, 'Duplicate ID: ' + club['id']
    ids.add(club['id'])
    assert club['category'] in categories
    assert club['year'] is None or isinstance(club['year'], int) and 1959 <= club['year'] <= 2026
    for field in ['name', 'family', 'summary', 'yearBasis']:
        assert isinstance(club[field], str) and club[field], (club['id'], field)
    assert club['sourceUrls'], 'Every model needs its sources'
    for source in club['sourceUrls']:
        assert urllib.parse.urlsplit(source['url']).scheme == 'https'
        assert source['label']
    for field in ['tags', 'variants']:
        assert isinstance(club.get(field, []), list)
    if club.get('image'):
        image = (ROOT / 'dist' / club['image']).resolve()
        assert image.is_relative_to(ROOT / 'dist/assets') and image.is_file(), club['id']
    if club.get('ironLofts'):
        spec = club['ironLofts']
        assert club['category'] == 'iron', club['id']
        assert spec['basis'] in {'standard', 'power', 'retro', 'japan'}, club['id']
        assert isinstance(spec['clubs'], list) and spec['clubs'], club['id']
        numbers = set()
        previous = 0
        for row in spec['clubs']:
            assert isinstance(row['club'], str) and row['club'] and row['club'] not in numbers, club['id']
            numbers.add(row['club'])
            assert isinstance(row['loft'], (int, float)) and not isinstance(row['loft'], bool), club['id']
            assert 10 <= row['loft'] <= 65 and row['loft'] >= previous, (club['id'], row)
            previous = row['loft']
        assert '7I' in numbers, club['id']
        seven = next(row['loft'] for row in spec['clubs'] if row['club'] == '7I')
        assert club.get('specs', {}).get('7番ロフト', '').startswith(f'{seven:g}°'), club['id']
        assert spec['sourceUrls'] and spec['verifiedAt'], club['id']
        for source in spec['sourceUrls']:
            assert urllib.parse.urlsplit(source['url']).scheme == 'https' and source['label'], club['id']
text = json.dumps(clubs, ensure_ascii=False, separators=(',', ':'))
(ROOT / 'dist/data.js').write_text('window.PING_CLUBS = ' + text + ';\n')
print(json.dumps({'items': len(clubs), 'photos': sum(bool(c.get('image')) for c in clubs), 'unknownYears': sum(c['year'] is None for c in clubs), 'categories': {k:sum(c['category']==k for c in clubs) for k in sorted(categories)}}))
