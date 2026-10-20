/*
 * app.js — 画面の描画と操作
 *
 * 役割分担
 *   data.js  : window.PING_CLUBS（data/catalog.json から scripts/build-data.py が生成）
 *   core.js  : 検索・絞り込み・世代判定・保存データ・URL状態（DOM に依存しない）
 *   lofts.js : アイアンのロフト表示（一覧・詳細・比較で同じデータを参照）
 *   app.js   : このファイル。DOM の描画、ダイアログ、保存、比較、イベント処理
 *
 * 構成
 *   1. 準備（参照・状態）
 *   2. 小さな部品（画像・ボタン・リンク）
 *   3. カード・年表・詳細・比較の HTML
 *   4. 画面の描画（Gシリーズ・カテゴリ・絞り込み・結果）
 *   5. URL と履歴
 *   6. 保存（お気に入り・メモ）
 *   7. 比較の選択
 *   8. ダイアログと通知
 *   9. 状態の変更
 *  10. イベント
 *  11. 初期化
 */
(function () {
  'use strict';

  // ===============================================================
  // 1. 準備
  // ===============================================================

  const C = window.ArchiveCore;
  const L = window.ArchiveLofts;
  const clubs = Array.isArray(window.PING_CLUBS) ? window.PING_CLUBS : [];
  const clubById = new Map(clubs.map(c => [c.id, c]));
  const esc = C.escapeHtml;
  const $ = id => document.getElementById(id);

  const STORAGE_KEY = 'golf-guts-ping-archive-v1';
  const PAGE_SIZE = 24;
  const TOAST_DURATION = 3600;

  // 保存データ（localStorage）。読めない環境でも画面は動かす。
  let storageAvailable = true;
  let rawSaved = '';
  try { rawSaved = localStorage.getItem(STORAGE_KEY) || ''; } catch { storageAvailable = false; }
  let saved = C.readSaved(rawSaved, clubs);

  // 画面の状態。state は URL と往復する。comparison は永続保存しない。
  let state = C.stateFromUrl(location.search, clubs);
  let comparison = [];
  let visibleCount = PAGE_SIZE;
  let activeDetail = null;   // 開いている詳細のモデルID
  let returnFocus = null;    // ダイアログを閉じたあとに戻す要素
  let toastTimer = null;

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ===============================================================
  // 2. 小さな部品
  // ===============================================================

  const HEART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

  // カテゴリの線画アイコン（写真が無い場合やカテゴリタブに使用）
  const GLYPH_PATHS = {
    all: '<rect x="4" y="4" width="9" height="9" rx="1"/><rect x="19" y="4" width="9" height="9" rx="1"/><rect x="4" y="19" width="9" height="9" rx="1"/><rect x="19" y="19" width="9" height="9" rx="1"/>',
    driver: '<path d="m21 3-4 14m2-4 1 6M10 15c-6 1-8 6-5 10 2 4 10 4 15 2s7-6 5-9-10-4-15-3Z"/><path d="M8 19c4-2 10-2 14 0M7 23c5 2 10 2 15-1"/>',
    fairway: '<path d="m22 3-6 16m-7-1c-5 1-6 4-4 7s7 4 13 2 7-5 5-7-10-4-14-2ZM8 23c4 2 9 2 12-1"/>',
    hybrid: '<path d="m23 3-6 16M9 18c-5 2-5 5-2 8s9 2 14 0c3-1 3-5 0-7s-7-2-12-1ZM10 22h9M10 25h9"/>',
    iron: '<path d="M23 3 15 19l-6 2c-2 1-3 3-1 5l3 3c1 1 3 0 4 0l11-6-5-7-6 3M11 23l8-4m-6 7 9-5"/>',
    wedge: '<path d="m23 3-7 15-9 6c-1 1-1 3 1 4l6 2 13-7-7-9-4 4M11 25l10-6m-7 8 10-6"/>',
    putter: '<path d="M18 3 13 22M5 22l20-3 2 6-20 3Z M6 24l19-3"/>'
  };

  function glyph(category) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (GLYPH_PATHS[category] || GLYPH_PATHS.iron) + '</svg>';
  }

  function categoryMeta(club) {
    return C.categories.find(c => c.id === club.category);
  }

  function yearText(club) {
    return club.year === null ? '年未確認' : String(club.year);
  }

  // 写真が無い・読み込めないときの代替表示。別モデルの写真は使わない。
  function fallback(category) {
    const short = C.categories.find(c => c.id === category)?.short || 'ARCHIVE';
    return '<span class="photo-fallback">' + glyph(category) + '<span>' + esc(short) + '</span><span class="fallback-label">写真は公式資料へ</span></span>';
  }

  function imageHtml(club, extra = '') {
    if (!club.image) return fallback(club.category);
    const alt = club.imageAlt || club.name + ' ' + C.categoryLabel(club.category) + 'の代表写真';
    return '<img src="' + esc(club.image) + '" alt="' + esc(alt) + '" data-category="' + esc(club.category) + '" loading="lazy" decoding="async" ' + extra + '>';
  }

  function sourceLinks(club) {
    return (club.sourceUrls || []).map(s =>
      '<a class="source-link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer"><span>' + esc(s.label) + '</span><span aria-hidden="true">↗</span></a>'
    ).join('');
  }

  function isSaved(id) { return saved.favorites.includes(id); }
  function isCompared(id) { return comparison.includes(id); }

  function saveButton(club) {
    const yes = isSaved(club.id);
    return '<button class="save-button' + (yes ? ' is-saved' : '') + '" data-save="' + esc(club.id) + '" aria-pressed="' + yes + '" aria-label="' + esc(club.name) + (yes ? 'の保存を解除' : 'を保存') + '">' + HEART_ICON + '</button>';
  }

  function compareButton(club) {
    const yes = isCompared(club.id);
    return '<button class="compare-button' + (yes ? ' is-selected' : '') + '" data-compare="' + esc(club.id) + '" aria-pressed="' + yes + '" aria-label="' + esc(club.name) + (yes ? 'を比較から外す' : 'を比較に追加') + '">'
      + '<span class="compare-check" aria-hidden="true">' + (yes ? '✓' : '') + '</span>' + (yes ? '選択中' : '比較する') + '</button>';
  }

  function tagList(tags) {
    return '<div class="tag-list">' + (tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>';
  }

  // ===============================================================
  // 3. カード・年表・詳細・比較の HTML
  // ===============================================================

  // 一覧カード：写真・モデル名・カテゴリ・年と根拠・特徴・バリエーション・7番ロフト・保存・比較・詳細
  function card(club) {
    const variantLine = (club.variants?.length ? club.variants.slice(0, 4) : (club.tags || []).slice(0, 3)).join(' / ');
    return '<article class="club-card" data-club="' + esc(club.id) + '">'
      + '<div class="card-visual">'
      + '<span class="card-year' + (club.year === 2026 ? ' new-year' : '') + '">' + yearText(club) + '</span>'
      + saveButton(club)
      + '<button class="card-image-button" data-detail="' + esc(club.id) + '" aria-label="' + esc(club.name) + ' ' + esc(C.categoryLabel(club.category)) + 'の詳細を見る">' + imageHtml(club) + '</button>'
      + '</div>'
      + '<div class="card-body">'
      + '<p class="card-type">' + categoryMeta(club).short + ' / ' + esc(C.categoryLabel(club.category)) + '</p>'
      + '<h3 class="card-title"><button data-detail="' + esc(club.id) + '">' + esc(club.name) + '</button></h3>'
      + '<p class="card-year-basis">' + esc(club.year === null ? '登場年を確認中' : club.yearBasis) + '</p>'
      + L.badge(club)
      + '<p class="card-summary">' + esc(club.summary) + '</p>'
      + '<p class="card-variant-line">' + esc(variantLine) + '</p>'
      + '<div class="card-actions">' + compareButton(club) + '<button class="detail-link" data-detail="' + esc(club.id) + '">詳細 <span aria-hidden="true">↗</span></button></div>'
      + '</div></article>';
  }

  // 年表カード
  function timelineCard(club) {
    return '<article class="timeline-card">'
      + '<button class="timeline-image" data-detail="' + esc(club.id) + '" aria-label="' + esc(club.name) + 'の詳細を見る">' + imageHtml(club) + '</button>'
      + '<div class="timeline-info">'
      + '<p class="card-type">' + categoryMeta(club).short + '</p>'
      + '<h3 class="card-title"><button data-detail="' + esc(club.id) + '">' + esc(club.name) + '</button></h3>'
      + '<p class="card-year-basis">' + esc(club.yearBasis) + '</p>'
      + L.badge(club)
      + '<p class="card-summary">' + esc(club.summary) + '</p>'
      + '</div>'
      + '<div class="timeline-actions">' + saveButton(club) + compareButton(club) + '</div>'
      + '</article>';
  }

  // 年ごとにまとめる。並び順は filterClubs が決める（年未確認は末尾）。
  function renderTimeline(items) {
    const groups = new Map();
    for (const club of items) {
      const key = yearText(club);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(club);
    }
    return [...groups].map(([year, group]) =>
      '<section class="timeline-group" aria-label="' + year + '"><h3 class="timeline-year">' + year + '</h3><div class="timeline-items">' + group.map(timelineCard).join('') + '</div></section>'
    ).join('');
  }

  // 同じカテゴリ・シリーズの関連モデル（多い場合は年の近い8件）
  function relatedClubs(club) {
    const related = clubs
      .filter(c => c.id !== club.id && c.category === club.category && c.family === club.family)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    if (related.length <= 8 || club.year === null) return related;
    return related
      .sort((a, b) => Math.abs((a.year ?? 0) - club.year) - Math.abs((b.year ?? 0) - club.year))
      .slice(0, 8)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }

  function detailHtml(club) {
    const id = club.id;
    const nearest = relatedClubs(club);
    const annotations = [club.yearNote, club.sourceNote].filter(Boolean);
    // アイアンの「7番ロフト」は番手別ロフト表に含まれるため、仕様一覧には重複表示しない
    const specEntries = Object.entries(club.specs || {}).filter(([key]) => club.category !== 'iron' || key !== '7番ロフト');
    const imageCredit = club.image
      ? esc(club.imageAlt || '公式資料の代表写真。バリエーションにより外観が異なります。') + ' / 写真：PING'
      : '写真未掲載。外観は公式資料でご確認ください。';
    const hasImageSourceLink = club.imageSource && !club.sourceUrls.some(s => s.url === club.imageSource);

    return '<div class="detail-top"><span>MODEL FILE / ' + categoryMeta(club).short + '</span>'
      + '<button class="icon-button close-dialog" data-close="detail-dialog" aria-label="モデルの詳細を閉じる">×</button></div>'
      + '<div class="detail-layout">'
      // 左：写真・出典・保存/比較ボタン
      + '<div class="detail-left">'
      + '<div class="detail-photo">' + imageHtml(club) + '</div>'
      + '<p class="detail-image-credit">' + imageCredit + '</p>'
      + '<div class="detail-buttons">'
      + '<button class="button button-outline detail-save" data-save="' + esc(id) + '" aria-pressed="' + isSaved(id) + '"></button>'
      + '<button class="button button-dark detail-compare" data-compare="' + esc(id) + '" aria-pressed="' + isCompared(id) + '"></button>'
      + '</div></div>'
      // 右：モデル情報
      + '<div class="detail-right">'
      + '<p class="detail-category">' + categoryMeta(club).short + ' / ' + esc(C.categoryLabel(club.category)) + '</p>'
      + '<h2 id="detail-title">' + esc(club.name) + '</h2>'
      + '<p class="detail-year"><strong>' + yearText(club) + '</strong><span>' + esc(club.yearBasis) + '</span></p>'
      + '<p class="detail-summary">' + esc(club.summary) + '</p>'
      + L.detail(club)
      + tagList(club.tags)
      + (club.variants?.length ? '<section class="detail-section"><h3>主なバリエーション・ヘッド</h3><div class="variants">' + club.variants.map(v => '<span class="variant">' + esc(v) + '</span>').join('') + '</div></section>' : '')
      + (specEntries.length ? '<section class="detail-section"><h3>確認できた仕様</h3><div class="variants">' + specEntries.map(([k, v]) => '<span class="variant">' + esc(k) + '：' + esc(v) + '</span>').join('') + '</div></section>' : '')
      + (annotations.length ? '<div class="detail-annotation">' + annotations.map(esc).join('<br>') + '</div>' : '')
      + '<section class="detail-section"><h3>公式資料・出典</h3><div class="source-list">' + sourceLinks(club)
      + (hasImageSourceLink ? '<a class="source-link" href="' + esc(club.imageSource) + '" target="_blank" rel="noopener noreferrer"><span>製品写真の公式出典</span><span aria-hidden="true">↗</span></a>' : '')
      + '</div></section>'
      + '<section class="detail-section"><h3 class="note-label"><label for="personal-note">自分用メモ</label><span id="note-status">' + (storageAvailable ? '自動保存' : '端末への保存は利用不可') + '</span></h3>'
      + '<textarea id="personal-note" class="personal-note" maxlength="' + C.NOTE_MAX_LENGTH + '" placeholder="試打した感想、レッスンで気づいたことなど…">' + esc(saved.notes[id] || '') + '</textarea>'
      + '<p class="note-help">この端末のブラウザー内に保存 / 最大3,000文字</p></section>'
      + '</div></div>'
      // 下：関連モデル
      + (nearest.length
        ? '<section class="related-block"><div class="related-header"><h3>' + esc(club.family) + 'シリーズの' + esc(C.categoryLabel(club.category)) + '</h3>'
          + '<button class="text-button" data-related-family="' + esc(club.family) + '" data-related-category="' + esc(club.category) + '">一覧で見る →</button></div>'
          + '<div class="related-items">' + nearest.map(c => '<button class="related-item" data-detail="' + esc(c.id) + '"><small>' + yearText(c) + '</small><strong>' + esc(c.name) + '</strong></button>').join('') + '</div></section>'
        : '');
  }

  function comparisonHtml(selected) {
    const sameCategory = new Set(selected.map(c => c.category)).size === 1;
    const hasIrons = selected.some(c => c.category === 'iron');
    const specKeys = [...new Set(selected.flatMap(c => Object.keys(c.specs || {})))].filter(key => !hasIrons || key !== '7番ロフト');
    const row = (label, cell) => '<tr><th scope="row">' + esc(label) + '</th>' + selected.map(c => '<td>' + cell(c) + '</td>').join('') + '</tr>';

    return '<p class="compare-intro">'
      + (sameCategory ? '発売・発表年、特徴、主な仕様を並べて確認できます。' : '異なるクラブの種類を選択しています。共通項目を中心に比較します。')
      + '<span class="mobile-table-note"> 表は横にスクロールできます。</span></p>'
      + '<div class="compare-scroll" tabindex="0" role="region" aria-label="モデル比較表。横にスクロールできます"><table class="compare-table">'
      + '<thead><tr><th scope="col">比較項目</th>'
      + selected.map(c => '<th scope="col"><div class="compare-photo">' + imageHtml(c) + '</div><p class="card-type">' + categoryMeta(c).short + '</p><h3 class="card-title">' + esc(c.name) + '</h3></th>').join('')
      + '</tr></thead><tbody>'
      + row('年・根拠', c => '<span class="compare-year-value">' + yearText(c) + '</span><span class="compare-year-basis">' + esc(c.yearBasis) + '</span>')
      + row('クラブの種類', c => esc(C.categoryLabel(c.category)))
      + row('シリーズ', c => esc(c.family))
      + (hasIrons ? row('7番ロフト', L.comparison) : '')
      + row('特徴', c => esc(c.summary))
      + row('主な仕様・ヘッド', c => (c.variants?.length ? c.variants.map(esc).join('<br>') : 'この項目は未収録'))
      + specKeys.map(k => row(k, c => (c.specs?.[k] ? esc(c.specs[k]) : '未収録'))).join('')
      + row('キーワード', c => tagList(c.tags))
      + row('年・資料の注記', c => [c.yearNote, c.sourceNote].filter(Boolean).map(esc).join('<br>') || '追加の注記なし')
      + row('公式資料', sourceLinks)
      + '</tbody></table></div>';
  }

  // ===============================================================
  // 4. 画面の描画
  // ===============================================================

  // 選択中の世代に属するクラブ（世代未選択なら全件）
  function generationClubs() {
    return state.generation === 'all' ? clubs : clubs.filter(c => C.generationOf(c) === state.generation);
  }

  // Gシリーズ選択欄。歴代年表では欄と専用見出しを隠し、一覧・保存では再表示する。
  // 件数は実データから数える。
  function renderGenerations() {
    const selected = C.generations.find(g => g.id === state.generation);
    const inTimeline = state.view === 'timeline';
    $('generation-picker').hidden = inTimeline;

    const button = g => {
      const count = clubs.filter(c => C.generationOf(c) === g.id).length;
      const on = state.generation === g.id;
      const label = g.id === 'g-2016' ? 'G<span class="generation-year">（2016）</span>' : esc(g.label);
      return '<button class="generation-button' + (on ? ' is-active' : '') + '" data-generation="' + g.id + '" aria-pressed="' + on + '" aria-controls="results" aria-label="' + esc(g.label) + 'のクラブ ' + count + '件を見る">'
        + '<strong>' + label + '</strong>'
        + '<span class="generation-button-bottom"><span>' + count + '件のクラブを見る</span><span class="generation-arrow" aria-hidden="true">' + (on ? '✓' : '→') + '</span></span>'
        + '</button>';
    };
    const main = C.generations.slice(0, C.MAIN_GENERATION_COUNT);
    const older = C.generations.slice(C.MAIN_GENERATION_COUNT);
    $('generation-buttons').innerHTML = main.map(button).join('');
    $('older-generation-buttons').innerHTML = older.map(button).join('');
    document.querySelector('[data-generation="all"]').setAttribute('aria-pressed', String(!selected));

    $('generation-results-heading').hidden = inTimeline || !selected;
    $('selected-generation-title').textContent = selected ? selected.label + 'のクラブ' : '';
    if (selected && older.some(g => g.id === selected.id)) $('older-generations').open = true;
  }

  // カテゴリタブ。世代選択中は、その世代に存在するカテゴリだけを出す。
  function renderCategories() {
    const scoped = generationClubs();
    const base = state.view === 'saved' ? scoped.filter(c => isSaved(c.id)) : scoped;
    const options = [{ id: 'all', label: 'すべて', short: 'ALL' }, ...C.categories]
      .filter(c => state.generation === 'all' || c.id === 'all' || c.id === state.category || base.some(x => x.category === c.id));
    $('category-tabs').innerHTML = options.map(c => {
      const count = c.id === 'all' ? base.length : base.filter(x => x.category === c.id).length;
      const on = state.category === c.id;
      return '<button class="category-button' + (on ? ' is-active' : '') + '" data-category-filter="' + c.id + '" aria-pressed="' + on + '">' + glyph(c.id) + '<span>' + c.label + '</span><span class="cat-count">' + count + '</span></button>';
    }).join('');
  }

  // 年代・年・シリーズの選択肢と、適用中の条件チップ。
  // 世代やカテゴリの変更で選べなくなった条件は初期値に戻す。
  function renderFilters() {
    const scoped = generationClubs();
    const categoryClubs = scoped.filter(c => state.category === 'all' || c.category === state.category);
    const hasUnknown = scoped.some(c => c.year === null);

    // 年代
    const decades = [...new Set(scoped.filter(c => c.year !== null).map(c => Math.floor(c.year / 10) * 10))].sort((a, b) => b - a);
    const decadeOptions = [['all', 'すべて'], ...decades.map(d => [String(d), d + '年代'])];
    if (hasUnknown) decadeOptions.push(['unknown', '年未確認']);
    if (!decadeOptions.some(([id]) => id === state.decade)) state.decade = 'all';
    $('decade-buttons').innerHTML = decadeOptions.map(([id, label]) => {
      const count = categoryClubs.filter(c => id === 'all' || (id === 'unknown' ? c.year === null : c.year !== null && Math.floor(c.year / 10) * 10 === Number(id))).length;
      const on = state.decade === id;
      return '<button class="decade-button' + (on ? ' is-active' : '') + '" data-decade="' + id + '" aria-pressed="' + on + '"><span>' + label + '</span><span>' + count + '</span></button>';
    }).join('');

    // 個別年
    const years = [...new Set(scoped.filter(c => c.year !== null).map(c => c.year))].sort((a, b) => b - a);
    if (state.year !== 'all' && !scoped.some(c => (c.year === null ? 'unknown' : String(c.year)) === state.year)) state.year = 'all';
    $('year-filter').innerHTML = '<option value="all">すべての年</option>'
      + years.map(y => '<option value="' + y + '">' + y + '年</option>').join('')
      + (hasUnknown ? '<option value="unknown">年未確認</option>' : '');
    $('year-filter').value = state.year;

    // シリーズ
    const families = [...new Set(categoryClubs.map(c => c.family))].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    $('family-filter').innerHTML = '<option value="all">すべてのシリーズ</option>' + families.map(f => '<option value="' + esc(f) + '">' + esc(f) + '</option>').join('');
    if (state.family !== 'all' && !families.includes(state.family)) state.family = 'all';
    $('family-filter').value = state.family;

    $('sort').value = state.sort;

    // 適用中の条件（個別に解除できる）
    const chips = [];
    if (state.generation !== 'all') chips.push(['generation', C.generations.find(g => g.id === state.generation).label]);
    if (state.q) chips.push(['q', '検索：' + state.q]);
    if (state.decade !== 'all') chips.push(['decade', state.decade === 'unknown' ? '年未確認' : state.decade + '年代']);
    if (state.year !== 'all') chips.push(['year', state.year === 'unknown' ? '年未確認' : state.year + '年']);
    if (state.family !== 'all') chips.push(['family', state.family]);
    $('active-filters').innerHTML = chips.map(([key, label]) =>
      '<button class="active-filter" data-clear-filter="' + key + '" aria-label="' + esc(label) + 'の条件を解除">' + esc(label) + '<span aria-hidden="true">×</span></button>'
    ).join('');
    const filterCount = ['decade', 'year', 'family'].filter(k => state[k] !== 'all').length;
    $('filter-count').textContent = filterCount ? '(' + filterCount + ')' : '';
  }

  function emptyStateHtml() {
    const noSaved = state.view === 'saved' && !saved.favorites.length;
    if (noSaved) {
      return '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">♡</span><h3>気になる一本を、ここに。</h3><p>クラブの♡を押すと、この画面に保存されます。</p><button class="button button-outline" data-browse>クラブ一覧を見る</button></div>';
    }
    return '<div class="empty-state"><span class="empty-glyph" aria-hidden="true">⌕</span><h3>該当するクラブがありません</h3><p>モデル名を短くするか、絞り込み条件を変えてみてください。</p><button class="button button-outline" data-reset-all>条件をリセット</button></div>';
  }

  function renderHeader() {
    const titles = { timeline: ['THROUGH THE YEARS', '歴代の流れを見る'], saved: ['YOUR COLLECTION', '保存したクラブ'], grid: ['EXPLORE THE ARCHIVE', 'クラブを探す'] };
    const [kicker, heading] = titles[state.view] || titles.grid;
    $('section-kicker').textContent = kicker;
    $('catalog-heading').textContent = heading;
    document.querySelectorAll('[data-view]').forEach(b => {
      const on = b.dataset.view === state.view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // 画面全体を状態から描き直す
  function render() {
    if (!clubs.length) {
      $('results').innerHTML = '<div class="empty-state"><h3>データを読み込めませんでした</h3><p>ページを再読み込みしてください。</p><button class="button button-dark" data-reload>再読み込み</button></div>';
      $('results-count').textContent = 'データ読み込みエラー';
      return;
    }
    $('total-count').textContent = clubs.length;
    $('saved-count').textContent = saved.favorites.length;
    $('search').value = state.q;
    $('clear-search').hidden = !state.q;
    $('saved-notice').hidden = state.view !== 'saved';
    renderHeader();
    renderGenerations();
    renderCategories();
    renderFilters();

    const filtered = C.filterClubs(clubs, state, saved.favorites);
    const items = filtered.slice(0, visibleCount);
    const scope = state.category === 'all' ? 'すべてのクラブ' : esc(C.categoryLabel(state.category));
    $('results-count').innerHTML = '<strong>' + filtered.length + '</strong> 件<span class="result-scope">' + scope + '</span>';
    $('results').className = state.view === 'timeline' ? 'timeline' : 'club-grid';
    if (!filtered.length) {
      $('results').innerHTML = emptyStateHtml();
    } else {
      $('results').innerHTML = state.view === 'timeline' ? renderTimeline(items) : items.map(card).join('');
    }
    $('load-more-wrap').hidden = filtered.length <= visibleCount;
    $('shown-count').textContent = items.length + ' / ' + filtered.length + ' 件を表示';
    updateUrl();
  }

  // ===============================================================
  // 5. URL と履歴
  // ===============================================================

  function detailIdFromHash() {
    try {
      return location.hash.startsWith('#model=') ? decodeURIComponent(location.hash.slice(7)) : null;
    } catch {
      return null;
    }
  }

  // 検索条件は ?query、開いている詳細は #model=ID で表す。
  function updateUrl(push = false) {
    const query = C.stateToSearch(state);
    const next = location.pathname + (query ? '?' + query : '') + (activeDetail ? '#model=' + encodeURIComponent(activeDetail) : '');
    if (location.pathname + location.search + location.hash !== next) {
      history[push ? 'pushState' : 'replaceState']({}, '', next);
    }
  }

  function restoreFromHistory() {
    state = C.stateFromUrl(location.search, clubs);
    const id = detailIdFromHash();
    activeDetail = clubById.has(id) ? id : null;
    render();
    renderCompareControls();
    if (activeDetail) openDetail(activeDetail, { url: false });
    else if ($('detail-dialog').open) closeDialog('detail-dialog', false);
  }

  // ===============================================================
  // 6. 保存（お気に入り・メモ）
  // ===============================================================

  // 保存できなかったときは false を返し、成功したようには見せない。
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: saved.favorites, notes: saved.notes }));
      storageAvailable = true;
      return true;
    } catch {
      storageAvailable = false;
      toast('ブラウザーに保存できません。この画面を閉じると内容が失われる場合があります。');
      return false;
    }
  }

  function updateSaveControls() {
    document.querySelectorAll('[data-save]').forEach(b => {
      const id = b.dataset.save;
      const yes = isSaved(id);
      const club = clubById.get(id);
      b.classList.toggle('is-saved', yes);
      b.setAttribute('aria-pressed', String(yes));
      b.setAttribute('aria-label', (club?.name || 'クラブ') + (yes ? 'の保存を解除' : 'を保存'));
      if (b.classList.contains('detail-save')) b.textContent = yes ? '♥ 保存済み' : '♡ このクラブを保存';
    });
    $('saved-count').textContent = saved.favorites.length;
  }

  function toggleSave(id) {
    if (!clubById.has(id)) return;
    const exists = isSaved(id);
    saved.favorites = exists ? saved.favorites.filter(x => x !== id) : [...saved.favorites, id];
    const ok = persist();
    if (state.view === 'saved') render(); else renderCategories();
    updateSaveControls();
    if (ok) toast(exists ? '保存を解除しました' : '保存しました');
  }

  function saveNote(id, text) {
    if (text) saved.notes[id] = text.slice(0, C.NOTE_MAX_LENGTH);
    else delete saved.notes[id];
    const ok = persist();
    const status = $('note-status');
    if (status) status.textContent = ok ? '保存しました' : '保存できませんでした';
  }

  // ===============================================================
  // 7. 比較の選択（最大3件、ページ内だけで保持）
  // ===============================================================

  function renderCompareControls() {
    document.querySelectorAll('[data-compare]').forEach(b => {
      const id = b.dataset.compare;
      const yes = isCompared(id);
      const club = clubById.get(id);
      b.setAttribute('aria-pressed', String(yes));
      b.classList.toggle('is-selected', yes);
      b.setAttribute('aria-label', (club?.name || 'クラブ') + (yes ? 'を比較から外す' : 'を比較に追加'));
      b.innerHTML = b.classList.contains('detail-compare')
        ? (yes ? '✓ 比較に選択中' : '＋ 比較に追加')
        : '<span class="compare-check" aria-hidden="true">' + (yes ? '✓' : '') + '</span>' + (yes ? '選択中' : '比較する');
    });
    $('compare-tray').hidden = !comparison.length;
    document.body.classList.toggle('has-compare', comparison.length > 0);
    $('compare-count').textContent = comparison.length;
    $('open-compare').disabled = comparison.length < 2;
    $('compare-selected').innerHTML = comparison.map(id => {
      const c = clubById.get(id);
      return '<div class="compare-chip"><span><small>' + esc(C.categoryLabel(c.category)) + '</small>' + esc(c.name) + '</span><button data-remove-compare="' + esc(id) + '" aria-label="' + esc(c.name) + 'を比較から外す">×</button></div>';
    }).join('');
  }

  function toggleCompare(id) {
    const result = C.toggleComparison(comparison, id, clubs);
    if (result.error === 'limit') {
      toast('比較は最大' + C.COMPARE_LIMIT + '件です。選択中のクラブを外してから追加してください。');
      return;
    }
    comparison = result.selected;
    renderCompareControls();
  }

  function removeFromCompare(id) {
    comparison = comparison.filter(x => x !== id);
    renderCompareControls();
  }

  function clearCompare() {
    comparison = [];
    renderCompareControls();
  }

  // ===============================================================
  // 8. ダイアログと通知
  // ===============================================================

  function showDialog(id) {
    const dialog = $(id);
    if (!dialog.open) {
      returnFocus = document.activeElement;
      dialog.showModal();
    }
    document.body.classList.add('modal-open');
  }

  // 閉じたあとは開く前の要素へフォーカスを戻す。戻せない場合は見出しへ。
  function closeDialog(id, changeUrl = true) {
    const dialog = $(id);
    dialog.close();
    dialog.querySelectorAll('.dialog-status').forEach(n => n.remove());
    if (id === 'detail-dialog') {
      activeDetail = null;
      if (changeUrl) updateUrl();
    }
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    } else {
      $('catalog-heading').tabIndex = -1;
      $('catalog-heading').focus({ preventScroll: true });
    }
  }

  // 通知。ダイアログが開いている間はダイアログ内に表示する（読み上げ対応）。
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
    document.querySelectorAll('.dialog-status').forEach(n => n.remove());
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      const status = document.createElement('div');
      status.className = 'dialog-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = message;
      dialog.prepend(status);
      toastTimer = setTimeout(() => status.remove(), TOAST_DURATION);
    } else {
      $('toast').textContent = message;
      $('toast').hidden = false;
      toastTimer = setTimeout(() => { $('toast').hidden = true; }, TOAST_DURATION);
    }
  }

  function openDetail(id, { url = true } = {}) {
    const club = clubById.get(id);
    if (!club) return;
    activeDetail = id;
    $('detail-content').innerHTML = detailHtml(club);
    updateSaveControls();
    renderCompareControls();
    showDialog('detail-dialog');
    $('detail-dialog').scrollTop = 0;
    $('detail-dialog').querySelector('[data-close]').focus({ preventScroll: true });
    if (url) updateUrl(true);
  }

  function openComparison() {
    if (comparison.length < 2) return;
    const selected = comparison.map(id => clubById.get(id));
    $('compare-content').innerHTML = comparisonHtml(selected);
    showDialog('compare-dialog');
  }

  // ===============================================================
  // 9. 状態の変更
  // ===============================================================

  // 状態を変えて描き直す。描き直しで消えたボタンにフォーカスがあった場合は同じボタンへ戻す。
  function changeState(patch, { scroll = false } = {}) {
    const focused = document.activeElement;
    const focusKind = ['categoryFilter', 'decade'].find(k => focused?.dataset?.[k]);
    const focusValue = focusKind ? focused.dataset[focusKind] : null;
    Object.assign(state, patch);
    visibleCount = PAGE_SIZE;
    render();
    renderCompareControls();
    if (focusKind) {
      const replacement = [...document.querySelectorAll('button')].find(b => b.dataset[focusKind] === focusValue);
      replacement?.focus({ preventScroll: true });
    }
    if (scroll) $('catalog').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // 条件リセット：検索・カテゴリ・年代・個別年・シリーズ・G世代を解除し、表示モードと並び順は維持
  function resetAll() {
    changeState({ q: '', category: 'all', decade: 'all', year: 'all', family: 'all', generation: 'all' });
  }

  // Gシリーズ選択：他の条件をリセットし、「クラブ一覧」「新しい年順」でその世代を表示
  function selectGeneration(generation) {
    if (generation !== 'all' && !C.generations.some(g => g.id === generation)) return;
    changeState({ ...C.defaults, generation });
    focusSection(generation === 'all' ? 'generation-heading' : 'selected-generation-title');
  }

  function switchView(view) {
    // 歴代年表は古い順で表示。条件（世代・検索など）は保持する。
    changeState({ view, ...(view === 'timeline' ? { sort: 'oldest' } : {}) }, { scroll: true });
  }

  function focusSection(id) {
    const section = $(id);
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
    section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // ===============================================================
  // 10. イベント
  // ===============================================================

  // ボタン類はひとつの click ハンドラーで data-* 属性から振り分ける（描き直しても付け直し不要）
  document.addEventListener('click', event => {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.detail) { openDetail(b.dataset.detail); return; }
    if (b.dataset.save) { toggleSave(b.dataset.save); return; }
    if (b.dataset.compare) { toggleCompare(b.dataset.compare); return; }
    if (b.dataset.removeCompare) { removeFromCompare(b.dataset.removeCompare); return; }
    if (b.dataset.close) { closeDialog(b.dataset.close); return; }
    if (b.dataset.view) { switchView(b.dataset.view); return; }
    if (b.dataset.generation) { selectGeneration(b.dataset.generation); return; }
    if (b.dataset.categoryFilter) { changeState({ category: b.dataset.categoryFilter, family: 'all' }); return; }
    if (b.dataset.decade) { changeState({ decade: b.dataset.decade, year: 'all' }); return; }
    if (b.dataset.clearFilter) { changeState({ [b.dataset.clearFilter]: C.defaults[b.dataset.clearFilter] }); return; }
    if (b.hasAttribute('data-reset-all')) { resetAll(); return; }
    if (b.hasAttribute('data-browse')) { changeState({ ...C.defaults }, { scroll: true }); return; }
    if (b.hasAttribute('data-reload')) { location.reload(); return; }
    if (b.dataset.relatedFamily) {
      closeDialog('detail-dialog');
      changeState({ view: 'grid', category: b.dataset.relatedCategory, family: b.dataset.relatedFamily, q: '', year: 'all', decade: 'all', generation: 'all' }, { scroll: true });
    }
  });

  // 検索：入力ごとに描き直し、カーソル位置は保つ
  $('search').addEventListener('input', () => {
    state.q = $('search').value.slice(0, 200);
    visibleCount = PAGE_SIZE;
    const caret = $('search').selectionStart;
    render();
    try { $('search').setSelectionRange(caret, caret); } catch { /* 一部ブラウザーの search 型では未対応 */ }
    renderCompareControls();
  });
  $('clear-search').addEventListener('click', () => { changeState({ q: '' }); $('search').focus(); });

  // 絞り込み：年を選ぶと年代を解除、年代を選ぶと年を解除（上の click ハンドラー）
  $('year-filter').addEventListener('change', () => changeState({ year: $('year-filter').value, decade: 'all' }));
  $('family-filter').addEventListener('change', () => changeState({ family: $('family-filter').value }));
  $('sort').addEventListener('change', () => changeState({ sort: $('sort').value }));
  $('reset-filters').addEventListener('click', resetAll);
  $('filter-toggle').addEventListener('click', () => {
    const open = !$('filter-panel').classList.contains('is-open');
    $('filter-panel').classList.toggle('is-open', open);
    $('filter-toggle').setAttribute('aria-expanded', String(open));
  });
  $('load-more').addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); renderCompareControls(); });

  // Gシリーズ：「シリーズを選び直す」は表示中の選択欄へ移動するだけ（条件は変えない）
  $('back-to-generations').addEventListener('click', () => focusSection('generation-heading'));

  // 比較
  $('clear-compare').addEventListener('click', clearCompare);
  $('open-compare').addEventListener('click', openComparison);

  // 説明ダイアログ
  for (const id of ['open-about', 'open-about-sidebar', 'open-sources']) $(id).addEventListener('click', () => showDialog('about-dialog'));

  // 表紙の G440 K カード → 該当ドライバーの詳細
  $('hero-feature').addEventListener('click', () => {
    const club = clubs.find(c => c.category === 'driver' && C.normalize(c.name) === 'g440k');
    if (club) openDetail(club.id);
  });

  // メモの自動保存
  document.addEventListener('input', event => {
    if (event.target.id === 'personal-note' && activeDetail) saveNote(activeDetail, event.target.value);
  });

  // 画像の読み込み失敗 → カテゴリの代替表示に置き換える（別モデルの写真は使わない）
  document.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName !== 'IMG') return;
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.photo-fallback')) {
      img.remove();
      parent.insertAdjacentHTML('afterbegin', fallback(img.dataset.category || 'driver'));
    }
  }, true);

  // ダイアログ：Escape と背景クリックで閉じる
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('cancel', e => { e.preventDefault(); closeDialog(dialog.id); });
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dialog.id);
    });
  }

  // 別タブでの保存変更を反映
  window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY) return;
    saved = C.readSaved(e.newValue, clubs);
    render();
    updateSaveControls();
    renderCompareControls();
    const note = $('personal-note');
    if (activeDetail && note && document.activeElement !== note) note.value = saved.notes[activeDetail] || '';
  });

  // ブラウザーの戻る・進む
  window.addEventListener('popstate', restoreFromHistory);

  // ===============================================================
  // 11. 初期化
  // ===============================================================

  const initialId = detailIdFromHash();
  if (clubById.has(initialId)) activeDetail = initialId;
  render();
  renderCompareControls();
  if (activeDetail) openDetail(activeDetail, { url: false });
})();
