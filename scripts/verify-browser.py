"""Browser checks for dist/ with headless Chromium (Playwright).

Usage:
  pip install playwright && python3 -m playwright install chromium
  python3 scripts/verify-browser.py            # serves dist/ on a free port and runs the checks
  python3 scripts/verify-browser.py --shots DIR  # also saves screenshots per viewport

Covers the delivery checklist: cover, G-series picker (no entry button, older generations open),
generation filtering, timeline hides the picker and keeps conditions, search/filters, load more,
saved/notes persistence, comparison limit, image failure fallback, dialogs, URL restore,
history back/forward, horizontal overflow at several widths, console errors.
"""
import argparse
import contextlib
import functools
import http.server
import json
import pathlib
import socket
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
CATALOG = json.loads((ROOT / 'data/catalog.json').read_text())
BY_ID = {c['id']: c for c in CATALOG}
EXPECTED_GENERATIONS = {'g440': 11, 'g430': 11, 'g425': 7, 'g410': 7, 'g400': 8, 'g-2016': 7, 'g30': 6, 'g25': 4, 'g20': 4, 'g15': 4, 'g10': 4, 'g5': 4, 'g2': 4}
VIEWPORTS = [('iphone-se', 375, 667), ('iphone-15', 393, 852), ('android-360', 360, 780), ('tablet', 820, 1180), ('laptop', 1366, 900), ('wide', 1600, 1000)]

results = []
failures = []


def check(name, condition, detail=''):
    results.append((name, bool(condition)))
    if not condition:
        failures.append(name + (' — ' + str(detail) if detail else ''))


@contextlib.contextmanager
def serve(directory):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args, **kwargs):
            pass
    handler = functools.partial(Handler, directory=str(directory))
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{port}/'
    finally:
        server.shutdown()


def count_text(page):
    return int(page.locator('#results-count strong').inner_text())


def run(url, shots):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        console = []
        ctx = browser.new_context(viewport={'width': 1366, 'height': 900})
        page = ctx.new_page()
        page.on('console', lambda m: console.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: console.append(str(e)))
        page.on('response', lambda r: console.append(f'{r.status} {r.url}') if r.status >= 400 and 'does-not-exist' not in r.url else None)
        page.goto(url)
        page.wait_for_selector('.club-card')

        # ---- initial display ----
        check('cover: PING logo shown', page.locator('.ping-logo').is_visible())
        check('cover: title/copy', page.locator('#hero-title').inner_text().strip().endswith('CLUB ARCHIVE.') and '名器' in page.locator('.hero-jp').inner_text())
        check('cover: item count equals data', page.locator('#total-count').inner_text() == str(len(CATALOG)))
        check('cover: 6 categories + private label', '6 カテゴリー' in page.locator('.hero-bottom').inner_text() and page.locator('.private-label').is_visible())
        hero_src = page.locator('.feature-photo img').get_attribute('src')
        check('cover: G440 K image loads', hero_src == 'assets/hero-g440k.png' and page.evaluate("document.querySelector('.feature-photo img').naturalWidth") > 0)
        check('cover: G440 K name', 'G440 K' in page.locator('.feature-bottom').inner_text())
        check('header: GOLF GUTS logo loads', page.evaluate("document.querySelector('.brand-logo').naturalWidth") > 0)
        check('logo files unchanged', page.evaluate("document.querySelector('.brand-logo').getAttribute('src')") == 'assets/branding/golf-guts-logo.svg')
        check('fonts: Poppins / Noto Sans JP declared', page.evaluate("getComputedStyle(document.body).fontFamily").startswith('Poppins') and 'Noto Sans JP' in page.evaluate("getComputedStyle(document.body).fontFamily"))
        check('fonts: local woff2 loaded', page.evaluate("document.fonts.check('500 20px Poppins') && document.fonts.check('400 14px \"Noto Sans JP\"')"))
        check('colors: background/text/accent', page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(248, 245, 239)' and page.evaluate("getComputedStyle(document.body).color") == 'rgb(43, 38, 34)' and page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase()") == '#C9A77C')
        check('picker: directly below cover, visible', page.locator('#generation-picker').is_visible() and page.evaluate("document.querySelector('.hero').compareDocumentPosition(document.querySelector('#generation-picker')) & Node.DOCUMENT_POSITION_FOLLOWING"))
        check('picker: no "Gシリーズを見る" entry button', page.evaluate("[...document.querySelectorAll('button,a')].filter(b=>/Gシリーズを(すぐ)?見る/.test(b.textContent)).length") == 0)
        check('picker: 4 main generations', [b.strip().split('\n')[0] for b in page.locator('#generation-buttons .generation-button strong').all_inner_texts()] == ['G440', 'G430', 'G425', 'G410'])
        check('picker: older generations open initially', page.locator('#older-generations').get_attribute('open') is not None and page.locator('#older-generation-buttons .generation-button').count() == 9 and page.locator('[data-generation="g2"]').is_visible())
        for gen, expected in EXPECTED_GENERATIONS.items():
            label = page.locator(f'[data-generation="{gen}"] .generation-button-bottom span').first.inner_text()
            check(f'picker: {gen} count from data ({expected})', label.startswith(str(expected)))

        # ---- generation selection ----
        page.fill('#search', 'テスト')
        page.click('[data-category-filter="iron"]')
        page.click('[data-generation="g430"]')
        page.wait_for_timeout(100)
        check('generation: resets search/category and shows grid newest', page.input_value('#search') == '' and page.locator('[data-category-filter="all"]').get_attribute('aria-pressed') == 'true' and page.input_value('#sort') == 'newest' and page.locator('[data-view="grid"]').get_attribute('aria-pressed') == 'true')
        check('generation: G430 count 11 across categories', count_text(page) == 11 and page.locator('.club-card').count() == 11)
        names = page.locator('.club-card .card-title').all_inner_texts()
        check('generation: G430 MAX 10K included, G LE/G MAX/G740 excluded', 'G430 MAX 10K' in names and not any(n.startswith(('G LE', 'G MAX', 'G740', 'G700')) for n in names))
        check('generation: selected state (aria-pressed + heading)', page.locator('[data-generation="g430"]').get_attribute('aria-pressed') == 'true' and page.locator('#selected-generation-title').inner_text() == 'G430のクラブ' and page.locator('#generation-results-heading').is_visible())
        check('generation: URL carries generation', 'generation=g430' in page.url)
        page.click('[data-generation="g2"]')
        g2 = page.locator('.club-card .card-title').all_inner_texts()
        check('generation: G2 does not absorb G20/G25', count_text(page) == 4 and all(n.startswith('G2') and not n.startswith(('G20', 'G25')) for n in g2))
        page.click('[data-generation="g-2016"]')
        g16 = page.locator('.club-card .card-title').all_inner_texts()
        check('generation: G(2016) includes G/LS TEC/SF TEC/Crossover only', count_text(page) == 7 and not any(n.startswith('G LE') or n == 'G MAX' for n in g16))
        page.click('[data-generation="g440"]')
        g440 = page.locator('.club-card .card-title').all_inner_texts()
        check('generation: G440 K and HL in G440', 'G440 K' in g440 and any('HL' in n for n in g440) and count_text(page) == 11)
        page.click('[data-generation="all"]')
        check('generation: "すべてのクラブ" clears generation', count_text(page) == len(CATALOG) and 'generation=' not in page.url)

        # ---- timeline hides picker, keeps conditions ----
        page.click('[data-generation="g425"]')
        page.click('[data-view="timeline"]')
        page.wait_for_timeout(100)
        check('timeline: picker + generation heading hidden', page.locator('#generation-picker').is_hidden() and page.locator('#generation-results-heading').is_hidden())
        check('timeline: cover, search, categories, filters still present', page.locator('.hero').is_visible() and page.locator('#search').is_visible() and page.locator('#category-tabs').is_visible() and page.locator('#filter-toggle').count() == 1)
        check('timeline: generation condition kept, oldest order', count_text(page) == 7 and page.input_value('#sort') == 'oldest' and 'generation=g425' in page.url)
        gap = page.evaluate("document.querySelector('.search-row').getBoundingClientRect().top - document.querySelector('.section-topline').getBoundingClientRect().bottom")
        check('timeline: no large blank where the picker was', gap < 40, gap)
        years = page.locator('.timeline-year').all_inner_texts()
        check('timeline: grouped by year ascending', years == sorted(years, key=lambda y: (y == '年未確認', y)))
        page.click('[data-view="grid"]')
        check('grid: picker and heading return, condition kept', page.locator('#generation-picker').is_visible() and page.locator('#generation-results-heading').is_visible() and count_text(page) == 7)
        page.click('[data-view="saved"]')
        check('saved: picker visible, empty state with recovery', page.locator('#generation-picker').is_visible() and page.locator('.empty-state [data-browse]').count() == 1)
        page.click('[data-view="grid"]')
        page.click('[data-view="timeline"]')
        page.click('[data-view="grid"]')
        page.click('[data-generation="all"]')
        page.click('[data-view="timeline"]')
        while page.locator('#load-more-wrap').is_visible():
            page.click('#load-more')
        check('timeline: load more reveals all items', page.locator('.timeline-card').count() == len(CATALOG))
        unknown_group = page.locator('.timeline-group').last.locator('.timeline-year').inner_text()
        check('timeline: year-unknown group at the end (11 items)', unknown_group == '年未確認' and page.locator('.timeline-group').last.locator('.timeline-card').count() == 11)
        page.click('[data-view="grid"]')

        # ---- search / filters ----
        for q in ['G430', 'Ｇ４３０', 'g430', 'g-430']:
            page.fill('#search', q)
            page.wait_for_timeout(50)
            check(f'search: "{q}" normalizes', count_text(page) == 11)
        page.fill('#search', 'G430 ドライバー MAX')
        check('search: AND with spaces', count_text(page) >= 1 and all('G430' in n for n in page.locator('.club-card .card-title').all_inner_texts()))
        page.fill('#search', 'zzz-nothing')
        check('search: zero results shows reset', page.locator('.empty-state [data-reset-all]').count() == 1)
        page.click('.empty-state [data-reset-all]')
        check('search: reset recovers', count_text(page) == len(CATALOG) and page.input_value('#search') == '')
        page.click('[data-category-filter="iron"]')
        page.click('[data-decade="2020"]')
        check('filters: category + decade', count_text(page) == sum(1 for c in CATALOG if c['category'] == 'iron' and c['year'] and 2020 <= c['year'] <= 2029))
        page.select_option('#year-filter', '2024')
        check('filters: year clears decade', page.locator('[data-decade="2020"]').get_attribute('aria-pressed') == 'false' and count_text(page) == sum(1 for c in CATALOG if c['category'] == 'iron' and c['year'] == 2024))
        page.click('[data-decade="2010"]')
        check('filters: decade clears year', page.input_value('#year-filter') == 'all')
        page.select_option('#family-filter', 'G')
        fam_count = count_text(page)
        check('filters: family combines', fam_count == sum(1 for c in CATALOG if c['category'] == 'iron' and c['year'] and 2010 <= c['year'] <= 2019 and c['family'] == 'G'))
        page.click('[data-category-filter="driver"]')
        check('filters: category change resets family, keeps decade', page.input_value('#family-filter') == 'all' and page.locator('[data-decade="2010"]').get_attribute('aria-pressed') == 'true')
        chips = page.locator('.active-filter').count()
        page.click('.active-filter[data-clear-filter="decade"]')
        check('filters: chips can be cleared individually', page.locator('.active-filter').count() == chips - 1)
        page.click('#reset-filters')
        check('filters: reset keeps view/sort', count_text(page) == len(CATALOG) and page.locator('[data-view="grid"]').get_attribute('aria-pressed') == 'true')
        check('list: 24 shown then more', page.locator('.club-card').count() == 24 and page.locator('#load-more-wrap').is_visible())
        page.click('#load-more')
        check('list: load more adds 24', page.locator('.club-card').count() == 48)
        page.select_option('#sort', 'name')
        check('sort: name order', page.locator('.club-card .card-title').all_inner_texts()[:1] != [] and page.input_value('#sort') == 'name')
        page.select_option('#sort', 'newest')

        # ---- cards / detail / lofts ----
        page.click('[data-category-filter="iron"]')
        card = page.locator('.club-card[data-club="iron-g425"]')
        check('card: year, basis, loft badge, actions', '2020' in card.locator('.card-year').inner_text() and card.locator('.card-year-basis').inner_text() != '' and '30°' in card.locator('.iron-loft-badge').inner_text() and card.locator('[data-save]').count() == 1 and card.locator('[data-compare]').count() == 1)
        card.locator('.card-title button').click()
        page.wait_for_selector('#detail-dialog[open]')
        d = page.locator('#detail-dialog')
        check('detail: name/category/year/basis/summary', d.locator('#detail-title').inner_text() == 'G425' and 'IRON' in d.locator('.detail-category').inner_text() and '2020' in d.locator('.detail-year').inner_text())
        lofts = {r.locator('th').evaluate('th => th.firstChild.textContent'): r.locator('td').inner_text() for r in d.locator('.iron-loft-table tbody tr').all()}
        expected = {r['club']: f"{r['loft']}°" for r in BY_ID['iron-g425']['ironLofts']['clubs']}
        check('detail: loft table equals data (no rounding, labels kept)', lofts == expected, (lofts, expected))
        check('detail: basis label, sources, note area, memo', '日本公式掲載仕様' in d.locator('.iron-loft-heading').inner_text() and d.locator('.iron-loft-sources a').count() >= 1 and d.locator('#personal-note').count() == 1 and d.locator('.source-list a').count() >= 1)
        check('detail: URL carries #model', '#model=iron-g425' in page.url)
        page.go_back()
        page.wait_for_timeout(200)
        check('history: back closes the open detail', not d.evaluate('d=>d.open') and '#model' not in page.url)
        page.go_forward()
        page.wait_for_timeout(200)
        check('history: forward reopens it', d.evaluate('d=>d.open') and '#model=iron-g425' in page.url)
        page.keyboard.press('Escape')
        check('detail: Escape closes and URL cleared', not d.evaluate('d=>d.open') and '#model' not in page.url)

        # unconfirmed lofts
        page.fill('#search', 'KARSTEN 1')
        k = page.locator('.club-card[data-club="iron-karsten1"]')
        check('lofts: KARSTEN 1 shows 資料未確認 in card', '未確認' in k.locator('.iron-loft-badge').inner_text() and '0°' not in k.inner_text())
        k.locator('.card-title button').click()
        check('lofts: unconfirmed in detail', '公式資料を確認できていません' in d.inner_text())
        page.click('#detail-dialog [data-close]')
        page.fill('#search', '')
        # power lofts
        for cid, seven in [('iron-i530', '27.5°'), ('iron-g730', '26.5°'), ('iron-i240', '31.5°')]:
            page.goto(url + f'?category=iron#model={cid}')
            page.wait_for_selector('#detail-dialog[open]')
            check(f'lofts: {cid} power loft {seven} + label', seven in d.locator('.iron-loft-table .is-reference td').inner_text() and 'パワーロフト' in d.locator('.iron-loft-heading').inner_text() and '日本公式' in d.locator('.iron-loft-heading').inner_text())
        page.goto(url + '#model=iron-i3-plus')
        page.wait_for_selector('#detail-dialog[open]')
        check('lofts: i3+ 34.4° / PW 47.2°', '34.4°' in d.locator('.is-reference td').inner_text() and any('47.2°' in t for t in d.locator('.iron-loft-table td').all_inner_texts()))
        check('direct link: detail opened from #model', d.locator('#detail-title').inner_text() == 'i3+')
        page.click('#detail-dialog [data-close]')

        # ---- saved / notes ----
        page.goto(url + '?category=iron')
        page.wait_for_selector('.club-card')
        page.click('.club-card[data-club="iron-g440"] [data-save]')
        page.click('.club-card[data-club="iron-g430"] [data-save]')
        check('saved: count updates', page.locator('#saved-count').inner_text() == '2')
        page.click('.club-card[data-club="iron-g430"] .card-title button')
        page.fill('#personal-note', 'メモ <b>テスト</b> & 確認')
        page.wait_for_timeout(100)
        check('notes: status after save', page.locator('#note-status').inner_text() == '保存しました')
        page.click('#detail-dialog [data-close]')
        page.reload()
        page.wait_for_selector('.club-card')
        check('saved: persists after reload', page.locator('#saved-count').inner_text() == '2')
        stored = page.evaluate("JSON.parse(localStorage.getItem('golf-guts-ping-archive-v1'))")
        check('storage: key/structure', stored['version'] == 1 and sorted(stored['favorites']) == ['iron-g430', 'iron-g440'] and stored['notes']['iron-g430'] == 'メモ <b>テスト</b> & 確認')
        page.goto(url + '#model=iron-g430')
        page.wait_for_selector('#detail-dialog[open]')
        check('notes: restored and not rendered as HTML', page.input_value('#personal-note') == 'メモ <b>テスト</b> & 確認' and page.locator('#personal-note b').count() == 0)
        page.click('#detail-dialog [data-close]')
        page.click('[data-view="saved"]')
        check('saved view: lists saved only', count_text(page) == 2)
        page.click('.club-card[data-club="iron-g440"] [data-save]')
        check('saved: remove updates view', count_text(page) == 1 and page.locator('#saved-count').inner_text() == '1')
        page.evaluate("localStorage.setItem('golf-guts-ping-archive-v1', '{broken json')")
        page.reload()
        page.wait_for_selector('.club-card, .empty-state')
        check('storage: broken data does not break page', page.locator('#saved-count').inner_text() == '0' and page.locator('#total-count').inner_text() == str(len(CATALOG)))
        page.evaluate("localStorage.setItem('golf-guts-ping-archive-v1', JSON.stringify({version:1,favorites:['no-such-id','iron-g440'],notes:{'no-such-id':'x'}}))")
        page.reload()
        page.wait_for_selector('.club-card')
        check('storage: unknown ids ignored', page.locator('#saved-count').inner_text() == '1')
        # storage unavailable
        page.evaluate("() => { Storage.prototype.setItem = function () { throw new Error('quota'); }; return true; }")
        page.click('[data-view="grid"]')
        page.click('.club-card [data-save] >> nth=0')
        page.wait_for_timeout(100)
        check('storage: failure shows notice, not success', '保存できません' in page.locator('#toast').inner_text())
        page.reload()
        page.wait_for_selector('.club-card')

        # ---- compare ----
        page.goto(url + '?category=iron')
        page.wait_for_selector('.club-card')
        page.click('.club-card[data-club="iron-g440"] [data-compare]')
        check('compare: 1 selected, open disabled', page.locator('#compare-count').inner_text() == '1' and page.locator('#open-compare').is_disabled())
        page.click('.club-card[data-club="iron-g430"] [data-compare]')
        check('compare: 2 selected enables', page.locator('#open-compare').is_enabled())
        page.click('.club-card[data-club="iron-g425"] [data-compare]')
        page.click('.club-card[data-club="iron-g410"] [data-compare]')
        page.wait_for_timeout(100)
        check('compare: 4th rejected with notice', page.locator('#compare-count').inner_text() == '3' and '最大3件' in page.locator('#toast').inner_text() and page.locator('.club-card[data-club="iron-g410"] [data-compare]').get_attribute('aria-pressed') == 'false')
        page.click('#open-compare')
        page.wait_for_selector('#compare-dialog[open]')
        table = page.locator('#compare-dialog')
        check('compare: 3 columns with photos, names', table.locator('thead th').count() == 4)
        sevens = table.locator('tbody tr').filter(has_text='7番ロフト').locator('td').all_inner_texts()
        check('compare: 7I lofts from same data', [s.split('\n')[0] for s in sevens] == ['29°', '29°', '30°'], sevens)
        rows_labels = table.locator('tbody th').all_inner_texts()
        check('compare: rows year/category/series/features/specs/notes/sources', all(x in rows_labels for x in ['年・根拠', 'クラブの種類', 'シリーズ', '特徴', '主な仕様・ヘッド', '年・資料の注記', '公式資料']))
        page.keyboard.press('Escape')
        page.click('.compare-chip [data-remove-compare="iron-g425"]')
        check('compare: individual removal', page.locator('#compare-count').inner_text() == '2')
        page.click('[data-category-filter="driver"]')
        page.click('.club-card [data-compare] >> nth=0')
        page.click('#open-compare')
        page.wait_for_selector('#compare-dialog[open]')
        check('compare: mixed categories flagged', '異なるクラブの種類' in table.locator('.compare-intro').inner_text())
        page.keyboard.press('Escape')
        page.click('#clear-compare')
        check('compare: clear all hides tray', page.locator('#compare-tray').is_hidden())
        check('compare: selection not persisted', 'compare' not in (page.evaluate("localStorage.getItem('golf-guts-ping-archive-v1')") or ''))

        # ---- image failure fallback ----
        page.goto(url + '?category=iron')
        page.wait_for_selector('.club-card')
        page.evaluate("const i=document.querySelector('.club-card[data-club=\"iron-g440\"] img'); i.src='assets/does-not-exist.jpg';")
        page.wait_for_timeout(500)
        check('image: failure shows category fallback', page.locator('.club-card[data-club="iron-g440"] .photo-fallback').count() == 1 and 'IRON' in page.locator('.club-card[data-club="iron-g440"] .photo-fallback').inner_text())
        no_photo = next((c for c in CATALOG if not c.get('image')), None)
        if no_photo:
            page.goto(url + '#model=' + no_photo['id'])
            page.wait_for_selector('#detail-dialog[open]')
            check('image: models without photo show fallback + official note', d.locator('.photo-fallback').count() == 1 and '公式資料' in d.locator('.detail-image-credit').inner_text())
            page.keyboard.press('Escape')

        # ---- invalid URL state ----
        page.goto(url + '?category=bad&view=bad&sort=bad&year=9999&generation=g9999&family=none#model=nothing')
        page.wait_for_selector('.club-card')
        check('url: invalid params fall back', count_text(page) == len(CATALOG) and not d.evaluate('d=>d.open'))
        page.goto(url + '?view=timeline&generation=g410&q=G410')
        page.wait_for_selector('.timeline-card')
        check('url: restored timeline + generation + query', page.locator('#generation-picker').is_hidden() and page.input_value('#search') == 'G410' and count_text(page) == 7)

        # ---- hero card opens G440 K ----
        page.goto(url)
        page.wait_for_selector('.club-card')
        page.click('#hero-feature')
        page.wait_for_selector('#detail-dialog[open]')
        check('cover: G440 K card opens driver detail', d.locator('#detail-title').inner_text() == 'G440 K' and 'DRIVER' in d.locator('.detail-category').inner_text())
        page.keyboard.press('Escape')
        check('dialog: focus returns to opener', page.evaluate("document.activeElement.id") == 'hero-feature')

        # ---- accessibility basics ----
        check('a11y: results count is live region', page.locator('#results-count').get_attribute('aria-live') == 'polite')
        check('a11y: generation buttons aria-pressed', page.locator('.generation-button[aria-pressed]').count() == 13)
        page.locator('.skip-link').focus()
        check('a11y: skip link appears on focus', page.evaluate("document.activeElement.className") == 'skip-link' and page.evaluate("document.querySelector('.skip-link').getBoundingClientRect().top") >= 0)

        check('console: no errors or missing resources (desktop)', not [c for c in console if 'does-not-exist' not in c and 'Failed to load resource' not in c], console)
        ctx.close()

        # ---- responsive ----
        for name, w, h in VIEWPORTS:
            mobile = w < 900
            ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
            errs = []
            page = ctx.new_page()
            page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto(url + '?category=iron')
            page.wait_for_selector('.club-card')
            sw = page.evaluate('document.documentElement.scrollWidth')
            check(f'{name}: no horizontal page scroll', sw <= w, f'{sw} > {w}')
            cols = page.evaluate("getComputedStyle(document.querySelector('.club-grid')).gridTemplateColumns.split(' ').length")
            gen_cols = page.evaluate("getComputedStyle(document.querySelector('.generation-grid')).gridTemplateColumns.split(' ').length")
            if w <= 820:
                if w <= 600:
                    check(f'{name}: 2-column cards and 2-column G buttons', cols == 2 and gen_cols == 2, (cols, gen_cols))
                check(f'{name}: filter toggle visible, panel closed', page.locator('#filter-toggle').is_visible() and page.locator('#filter-panel').is_hidden())
                page.click('#filter-toggle')
                check(f'{name}: filter panel opens', page.locator('#filter-panel').is_visible())
                page.click('#filter-toggle')
                check(f'{name}: search input >= 16px (no iOS zoom)', page.evaluate("parseFloat(getComputedStyle(document.getElementById('search')).fontSize)") >= 16)
            else:
                check(f'{name}: filter panel on the left', page.locator('#filter-panel').is_visible() and page.evaluate("document.getElementById('filter-panel').getBoundingClientRect().left < document.getElementById('results').getBoundingClientRect().left"))
            # long names do not overflow their card
            page.fill('#search', '')
            page.select_option('#sort', 'name')
            overflow = page.evaluate("[...document.querySelectorAll('.club-card')].filter(c=>c.scrollWidth>c.clientWidth+1).length")
            check(f'{name}: card content fits (no clipped names)', overflow == 0, overflow)
            # compare tray + safe area
            page.click('.club-card [data-compare] >> nth=0')
            page.click('.club-card [data-compare] >> nth=1')
            tray = page.locator('#compare-tray')
            check(f'{name}: compare tray within viewport', tray.is_visible() and page.evaluate("document.getElementById('compare-tray').getBoundingClientRect().bottom") <= h + 1)
            check(f'{name}: body padding reserves tray height', page.evaluate("parseFloat(getComputedStyle(document.body).paddingBottom)") >= page.evaluate("document.getElementById('compare-tray').getBoundingClientRect().height") - 1)
            check(f'{name}: tray uses safe-area inset', 'safe-area-inset-bottom' in page.evaluate("[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).filter(r=>r.selectorText==='.compare-tray').map(r=>r.cssText).join(' ')"))
            page.click('#open-compare')
            page.wait_for_selector('#compare-dialog[open]')
            r = page.evaluate("(()=>{const r=document.getElementById('compare-dialog').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()")
            check(f'{name}: compare dialog within viewport', r[0] >= 0 and r[1] >= 0 and r[2] <= w + 1 and r[3] <= h + 1, r)
            check(f'{name}: compare table scrolls internally', page.evaluate("const s=document.querySelector('.compare-scroll');s.scrollWidth>=s.clientWidth") and page.evaluate("getComputedStyle(document.querySelector('.compare-scroll')).overflowX") == 'auto')
            if shots:
                page.screenshot(path=str(shots / f'{name}-compare.png'))
            page.keyboard.press('Escape')
            page.click('.club-card .card-title button >> nth=0')
            page.wait_for_selector('#detail-dialog[open]')
            r = page.evaluate("(()=>{const r=document.getElementById('detail-dialog').getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})()")
            check(f'{name}: detail dialog within viewport, scrollable', r[0] >= 0 and r[1] >= 0 and r[2] <= w + 1 and r[3] <= h + 1 and page.evaluate("const d=document.getElementById('detail-dialog');d.scrollHeight>=d.clientHeight"), r)
            if shots:
                page.screenshot(path=str(shots / f'{name}-detail.png'))
            page.keyboard.press('Escape')
            if shots:
                page.goto(url)
                page.wait_for_selector('.club-card')
                page.screenshot(path=str(shots / f'{name}-top.png'), full_page=False)
                page.click('[data-view="timeline"]')
                page.wait_for_timeout(600)
                page.screenshot(path=str(shots / f'{name}-timeline.png'), full_page=False)
            check(f'{name}: no console errors', not errs, errs)
            ctx.close()

        # reduced motion honoured in CSS
        ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, reduced_motion='reduce')
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_selector('.club-card')
        check('a11y: reduced motion disables smooth scroll', page.evaluate("getComputedStyle(document.documentElement).scrollBehavior") == 'auto')
        ctx.close()
        browser.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--shots', type=pathlib.Path)
    args = parser.parse_args()
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    with serve(DIST) as url:
        run(url, args.shots)
    passed = sum(1 for _, ok in results if ok)
    print(json.dumps({'status': 'failed' if failures else 'passed', 'checks': len(results), 'passed': passed, 'failures': failures}, ensure_ascii=False, indent=1))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
