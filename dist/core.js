/*
 * core.js — 表示に依存しない処理（検索・絞り込み・並び替え・世代判定・保存データ・URL状態）
 *
 * ブラウザーでは window.ArchiveCore、Node（scripts/verify-core.cjs）では module.exports として読み込む。
 * このファイルは DOM を触らない。画面の描画は app.js、ロフト表示は lofts.js。
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // 定義（カテゴリ・Gシリーズ世代・初期状態）
  // ---------------------------------------------------------------

  // 6カテゴリ。表示順もこの順。
  const categories = [
    { id: 'driver', label: 'ドライバー', short: 'DRIVER', glyph: 'D' },
    { id: 'fairway', label: 'フェアウェイウッド', short: 'FAIRWAY', glyph: 'F' },
    { id: 'hybrid', label: 'ハイブリッド', short: 'HYBRID', glyph: 'H' },
    { id: 'iron', label: 'アイアン', short: 'IRON', glyph: 'I' },
    { id: 'wedge', label: 'ウェッジ', short: 'WEDGE', glyph: 'W' },
    { id: 'putter', label: 'パター', short: 'PUTTER', glyph: 'P' }
  ];

  // Gシリーズの世代。先頭4件が主な世代、5件目以降が「G400以前」。
  const generations = [
    { id: 'g440', label: 'G440' },
    { id: 'g430', label: 'G430' },
    { id: 'g425', label: 'G425' },
    { id: 'g410', label: 'G410' },
    { id: 'g400', label: 'G400' },
    { id: 'g-2016', label: 'G（2016）' },
    { id: 'g30', label: 'G30' },
    { id: 'g25', label: 'G25' },
    { id: 'g20', label: 'G20' },
    { id: 'g15', label: 'G15' },
    { id: 'g10', label: 'G10' },
    { id: 'g5', label: 'G5' },
    { id: 'g2', label: 'G2' }
  ];
  const MAIN_GENERATION_COUNT = 4;

  const VIEWS = ['grid', 'timeline', 'saved'];
  const SORTS = ['newest', 'oldest', 'name'];

  // 検索・絞り込みの初期状態。URL には初期値と異なる項目だけを書き出す。
  const defaults = Object.freeze({
    q: '',
    category: 'all',
    decade: 'all',
    year: 'all',
    family: 'all',
    sort: 'newest',
    view: 'grid',
    generation: 'all'
  });

  // ---------------------------------------------------------------
  // 文字列の正規化と世代判定
  // ---------------------------------------------------------------

  // 全角・半角、大文字・小文字、空白、各種ハイフン・中黒の違いを吸収する。
  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s_\-‐‑–—・･]/g, '');
  }

  // モデル名だけから世代を判定する。説明文やシリーズ名は使わない。
  //  - "G440 K", "G430 MAX 10K" → 先頭の G+数字 がそのまま世代
  //  - "G", "G LS TEC", "G SF TEC", "G Crossover" → g-2016
  //  - "G LE", "G MAX", "G700", "G740", "GLIDE" → null（世代に含めない）
  function generationOf(club) {
    const name = normalize(club.name);
    const numeric = name.match(/^g(\d+)/);
    if (numeric) {
      const id = 'g' + numeric[1];
      return generations.some(g => g.id === id) ? id : null;
    }
    return ['g', 'g(2016)', 'glstec', 'gsftec', 'gcrossover'].includes(name) ? 'g-2016' : null;
  }

  function categoryLabel(id) {
    return categories.find(c => c.id === id)?.label || id;
  }

  function categoryIndex(id) {
    return categories.findIndex(c => c.id === id);
  }

  // ---------------------------------------------------------------
  // 検索
  // ---------------------------------------------------------------

  // 検索対象：モデル名・シリーズ名・主な特徴・カテゴリ名・別名・タグ・主なバリエーション
  function searchable(club) {
    return normalize([
      club.name,
      club.family,
      club.summary,
      categoryLabel(club.category),
      club.category === 'hybrid' ? 'ユーティリティ UT クロスオーバー' : '',
      ...(club.aliases || []),
      ...(club.tags || []),
      ...(club.variants || [])
    ].join(' '));
  }

  // 空白区切りの複数語は AND 検索。
  function matchesQuery(club, query) {
    const hay = searchable(club);
    return String(query || '')
      .normalize('NFKC')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every(term => hay.includes(normalize(term)));
  }

  // ---------------------------------------------------------------
  // 絞り込みと並び替え
  // ---------------------------------------------------------------

  function decadeOf(year) {
    return Math.floor(year / 10) * 10;
  }

  function matchesDecade(club, decade) {
    if (decade === 'all') return true;
    if (decade === 'unknown') return club.year === null;
    return club.year !== null && decadeOf(club.year) === Number(decade);
  }

  function matchesYear(club, year) {
    if (year === 'all') return true;
    if (year === 'unknown') return club.year === null;
    return club.year === Number(year);
  }

  function compareByName(a, b) {
    return a.name.localeCompare(b.name, 'ja', { numeric: true });
  }

  // 年順では「年未確認」を末尾にまとめる。同じ年の中はカテゴリ順→名前順。
  function compareByYear(a, b, direction) {
    if (a.year === null && b.year !== null) return 1;
    if (a.year !== null && b.year === null) return -1;
    const diff = (a.year ?? 0) - (b.year ?? 0);
    return (direction === 'oldest' ? diff : -diff)
      || categoryIndex(a.category) - categoryIndex(b.category)
      || compareByName(a, b);
  }

  function filterClubs(clubs, state = {}, saved = []) {
    const s = { ...defaults, ...state };
    const savedSet = saved instanceof Set ? saved : new Set(saved);
    const result = clubs.filter(club =>
      (s.generation === 'all' || generationOf(club) === s.generation)
      && (s.category === 'all' || s.category === club.category)
      && matchesDecade(club, s.decade)
      && matchesYear(club, s.year)
      && (s.family === 'all' || club.family === s.family)
      && (s.view !== 'saved' || savedSet.has(club.id))
      && matchesQuery(club, s.q)
    );
    result.sort((a, b) => {
      if (s.sort === 'name') {
        return compareByName(a, b) || categoryIndex(a.category) - categoryIndex(b.category);
      }
      return compareByYear(a, b, s.sort);
    });
    return result;
  }

  // ---------------------------------------------------------------
  // 比較の選択（最大3件、永続保存はしない）
  // ---------------------------------------------------------------

  const COMPARE_LIMIT = 3;

  function toggleComparison(selected, id, clubs) {
    const valid = new Set(clubs.map(c => c.id));
    const next = [...new Set(selected)].filter(x => valid.has(x));
    if (!valid.has(id)) return { selected: next, error: 'missing' };
    if (next.includes(id)) return { selected: next.filter(x => x !== id), error: null };
    if (next.length >= COMPARE_LIMIT) return { selected: next, error: 'limit' };
    return { selected: [...next, id], error: null };
  }

  // ---------------------------------------------------------------
  // 保存データ（localStorage の中身）の読み取り
  //   保存キー: golf-guts-ping-archive-v1
  //   構造: { version: 1, favorites: [モデルID], notes: { モデルID: メモ本文 } }
  // ---------------------------------------------------------------

  const NOTE_MAX_LENGTH = 3000;

  // 壊れた JSON、存在しないモデルID、重複、長すぎるメモを取り除いて返す。
  function readSaved(raw, clubs) {
    try {
      const parsed = JSON.parse(raw || '{}');
      const valid = new Set(clubs.map(c => c.id));
      const favorites = Array.isArray(parsed.favorites)
        ? [...new Set(parsed.favorites.filter(id => typeof id === 'string' && valid.has(id)))]
        : [];
      const notes = {};
      if (parsed.notes && typeof parsed.notes === 'object' && !Array.isArray(parsed.notes)) {
        for (const [id, note] of Object.entries(parsed.notes)) {
          if (valid.has(id) && typeof note === 'string') notes[id] = note.slice(0, NOTE_MAX_LENGTH);
        }
      }
      return { favorites, notes };
    } catch {
      return { favorites: [], notes: {} };
    }
  }

  // ---------------------------------------------------------------
  // URL との往復（無効な値は初期値に戻す）
  // ---------------------------------------------------------------

  function stateFromUrl(search, clubs) {
    const p = new URLSearchParams(search);
    const s = { ...defaults };
    if (p.has('q')) s.q = p.get('q').slice(0, 200);
    if (categories.some(c => c.id === p.get('category'))) s.category = p.get('category');
    if (VIEWS.includes(p.get('view'))) s.view = p.get('view');
    if (SORTS.includes(p.get('sort'))) s.sort = p.get('sort');
    if (generations.some(g => g.id === p.get('generation'))) s.generation = p.get('generation');
    const years = new Set(clubs.map(c => (c.year === null ? 'unknown' : String(c.year))));
    const decades = new Set(clubs.map(c => (c.year === null ? 'unknown' : String(decadeOf(c.year)))));
    if (years.has(p.get('year'))) s.year = p.get('year');
    if (decades.has(p.get('decade'))) s.decade = p.get('decade');
    if (clubs.some(c => c.family === p.get('family'))) s.family = p.get('family');
    return s;
  }

  function stateToSearch(state) {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(defaults)) {
      if (state[key] !== value && state[key] !== undefined) p.set(key, state[key]);
    }
    return p.toString();
  }

  // ---------------------------------------------------------------
  // HTML エスケープ（メモや資料の文字列を HTML として実行させない）
  // ---------------------------------------------------------------

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  const api = {
    categories, generations, MAIN_GENERATION_COUNT, defaults, COMPARE_LIMIT, NOTE_MAX_LENGTH,
    normalize, generationOf, categoryLabel, matchesQuery, filterClubs, toggleComparison,
    readSaved, stateFromUrl, stateToSearch, escapeHtml
  };
  root.ArchiveCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
