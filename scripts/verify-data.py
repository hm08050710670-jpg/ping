"""Check data/catalog.json and dist/data.js against the 2026-10-20 audit baseline.

Run after `python3 scripts/build-data.py`. Fails if:
  - dist/data.js is stale (differs from catalog.json),
  - item / category counts differ from the audit summary,
  - iron loft tables or rows differ from the audit (57 tables / 561 rows),
  - the five irons without verified lofts gained a table, or any iron lost its 7I row,
  - a confirmed decimal loft was rounded,
  - the number of items with an unconfirmed year changed (11).
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
catalog = json.loads((ROOT / 'data/catalog.json').read_text())
audit = json.loads((ROOT / 'data/audits/2026-10-20.json').read_text())
summary = audit['summary']
problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


# dist/data.js must be generated from the current catalog
data_js = (ROOT / 'dist/data.js').read_text()
match = re.fullmatch(r'window\.PING_CLUBS = (.*);\n', data_js, re.S)
check(match is not None, 'dist/data.js does not have the expected shape')
if match:
    check(json.loads(match.group(1)) == catalog, 'dist/data.js is stale: run python3 scripts/build-data.py')

# counts
by_id = {c['id']: c for c in catalog}
check(len(catalog) == summary['recordsReviewed'], f"item count {len(catalog)} != {summary['recordsReviewed']}")
for category, expected in summary['categoryCounts'].items():
    actual = sum(c['category'] == category for c in catalog)
    check(actual == expected, f'{category}: {actual} != {expected}')

irons = [c for c in catalog if c['category'] == 'iron']
with_lofts = [c for c in irons if c.get('ironLofts')]
rows = sum(len(c['ironLofts']['clubs']) for c in with_lofts)
check(len(irons) == summary['ironModels'], f"iron models {len(irons)} != {summary['ironModels']}")
check(len(with_lofts) == summary['ironTablesAfterAudit'], f"loft tables {len(with_lofts)} != {summary['ironTablesAfterAudit']}")
check(rows == summary['ironLoftRowsAfterAudit'], f"loft rows {rows} != {summary['ironLoftRowsAfterAudit']}")

unconfirmed = sorted(c['id'] for c in irons if not c.get('ironLofts'))
check(unconfirmed == sorted(summary['ironsWithoutVerifiedLoftTables']), f'unconfirmed irons changed: {unconfirmed}')
for c in with_lofts:
    numbers = [r['club'] for r in c['ironLofts']['clubs']]
    check('7I' in numbers, f"{c['id']}: no 7I row")
    for field in ('basis', 'clubs', 'sourceUrls', 'verifiedAt'):  # basisLabel is optional (13 older tables use the basis code only)
        check(field in c['ironLofts'], f"{c['id']}: ironLofts.{field} missing")

# audit records hold the post-audit loft rows; the catalog must match them exactly (no rounding, same labels)
for record in audit['records']:
    spec = record.get('ironLofts') or {}
    club = by_id.get(record['id'])
    check(club is not None, f"audit record {record['id']} missing from catalog")
    if club is None or spec.get('status') in (None, 'not_applicable', 'unverified'):
        continue
    if spec.get('rowsAfterAudit'):
        actual = len(club.get('ironLofts', {}).get('clubs', []))
        check(actual == spec['rowsAfterAudit'], f"{club['id']}: {actual} rows != audit {spec['rowsAfterAudit']}")
    if spec.get('basis'):
        check(club['ironLofts']['basis'] == spec['basis'], f"{club['id']}: basis {club['ironLofts']['basis']} != {spec['basis']}")
    if spec.get('basisLabel'):
        check(club['ironLofts']['basisLabel'] == spec['basisLabel'], f"{club['id']}: basisLabel differs from audit")

for comparison in audit['verification'].get('originalIronTableComparisons', []):
    club = by_id.get(comparison['id'])
    if club and club.get('ironLofts') and comparison.get('extractedRows'):
        actual = [(r['club'], float(r['loft'])) for r in club['ironLofts']['clubs']]
        expected = [(r['club'], float(r['loft'])) for r in comparison['extractedRows']]
        check(actual == expected, f"{club['id']}: loft rows differ from audited extraction")

# representative values listed in the brief
expected_sevens = {'iron-g440': (29, 42, 'PW'), 'iron-g430': (29, 41, 'PW'), 'iron-g425': (30, 44.5, 'PW'), 'iron-g410': (30, 44.5, 'PW'),
                   'iron-i530': (27.5, 41, 'PW'), 'iron-g730': (26.5, 40, 'PW'), 'iron-i240': (31.5, 44.5, 'PW'), 'iron-i3-plus': (34.4, 47.2, 'PW')}
for club_id, (seven, pw, pw_label) in expected_sevens.items():
    club = by_id.get(club_id)
    check(club is not None, f'{club_id} not found')
    if club:
        lofts = {r['club']: r['loft'] for r in club['ironLofts']['clubs']}
        check(lofts.get('7I') == seven, f"{club['name']}: 7I {lofts.get('7I')} != {seven}")
        check(lofts.get(pw_label) == pw, f"{club['name']}: {pw_label} {lofts.get(pw_label)} != {pw}")
for club_id in ('iron-i530', 'iron-g730', 'iron-i240'):
    check(by_id[club_id]['ironLofts']['basis'] == 'power' and '日本公式' in by_id[club_id]['ironLofts']['basisLabel'],
          f'{club_id}: power loft basis label changed')

unknown_years = sum(c['year'] is None for c in catalog)
check(unknown_years == summary['unknownYearsAfter'], f"unknown years {unknown_years} != {summary['unknownYearsAfter']}")

if problems:
    print(json.dumps({'status': 'failed', 'problems': problems}, ensure_ascii=False, indent=1))
    sys.exit(1)
print(json.dumps({'status': 'passed', 'items': len(catalog), 'ironTables': len(with_lofts), 'loftRows': rows,
                  'unconfirmedIrons': unconfirmed, 'unknownYears': unknown_years}, ensure_ascii=False))
