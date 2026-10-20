/*
 * lofts.js — アイアンのロフト表示
 *
 * 一覧（badge）・詳細（detail）・比較（comparison）の3か所は、すべて club.ironLofts.clubs を
 * この getLoft / rows から読む。角度を別々に持たない。数値は丸めず、番手名も元データどおり。
 * ironLofts が無いアイアンは「資料未確認」と表示し、推測値や 0° は出さない。
 */
(function (root) {
  'use strict';

  const esc = root.ArchiveCore.escapeHtml;

  // basis（短い区分）の表示名。basisLabel がある場合は詳細でそちらを優先する。
  const basisLabels = {
    standard: '標準ロフト',
    power: 'パワーロフト',
    retro: 'レトロスペック',
    japan: '日本公式仕様'
  };
  const REFERENCE_CLUB = '7I';

  function rows(club) {
    return club.category === 'iron' && Array.isArray(club.ironLofts?.clubs) ? club.ironLofts.clubs : [];
  }

  function getLoft(club, number = REFERENCE_CLUB) {
    const value = rows(club).find(r => r.club === number)?.loft;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function degrees(value) {
    return value === null ? '未確認' : String(value) + '°';
  }

  // full=true のときは basisLabel（例：パワーロフト（日本公式掲載仕様））をそのまま使う。
  function basisLabel(club, full = false) {
    if (!club.ironLofts) return '資料未確認';
    const short = basisLabels[club.ironLofts.basis] || 'メーカー掲載仕様';
    return full ? (club.ironLofts.basisLabel || short) : short;
  }

  function sourceLinks(spec) {
    return (spec.sourceUrls || []).map(s =>
      '<a class="source-link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">'
      + '<span>' + esc(s.label) + '</span><span aria-hidden="true">↗</span></a>'
    ).join('');
  }

  // 一覧カード・年表カード用：7番ロフトと仕様区分
  function badge(club) {
    if (club.category !== 'iron') return '';
    const value = getLoft(club);
    const unknown = value === null;
    return '<div class="iron-loft-badge' + (unknown ? ' is-unconfirmed' : '') + '">'
      + '<span class="iron-loft-label">7番ロフト</span>'
      + '<strong class="iron-loft-value">' + esc(degrees(value)) + '</strong>'
      + '<span class="iron-loft-basis">' + esc(unknown ? '資料未確認' : basisLabel(club)) + '</span>'
      + '</div>';
  }

  // 詳細画面用：番手別ロフト表・仕様区分・注記・出典
  function detail(club) {
    if (club.category !== 'iron') return '';
    const items = rows(club);
    if (!items.length) {
      return '<section class="detail-section iron-loft-section"><h3>番手別ロフト</h3>'
        + '<p class="iron-loft-unconfirmed">このモデルのロフトは、公式資料を確認できていません。</p></section>';
    }
    const spec = club.ironLofts;
    const tableRows = items.map(r => {
      const isReference = r.club === REFERENCE_CLUB;
      return '<tr' + (isReference ? ' class="is-reference"' : '') + '>'
        + '<th scope="row">' + esc(r.club) + (isReference ? '<small>7番アイアン</small>' : '') + '</th>'
        + '<td>' + esc(degrees(r.loft)) + '</td></tr>';
    }).join('');
    return '<section class="detail-section iron-loft-section" aria-labelledby="iron-loft-heading">'
      + '<div class="iron-loft-heading"><h3 id="iron-loft-heading">番手別ロフト</h3><span>' + esc(basisLabel(club, true)) + '</span></div>'
      + '<table class="iron-loft-table"><caption>' + esc(club.name) + 'のメーカー掲載ロフト</caption>'
      + '<thead><tr><th scope="col">番手</th><th scope="col">ロフト角</th></tr></thead>'
      + '<tbody>' + tableRows + '</tbody></table>'
      + (spec.note ? '<p class="iron-loft-note">' + esc(spec.note) + '</p>' : '')
      + '<p class="iron-loft-note">カスタム仕様や調整後の実測値とは異なる場合があります。</p>'
      + '<div class="iron-loft-sources">' + sourceLinks(spec) + '</div>'
      + '</section>';
  }

  // 比較表用：7番ロフトと仕様区分
  function comparison(club) {
    if (club.category !== 'iron') return '対象外';
    const value = getLoft(club);
    return '<strong class="compare-loft-value">' + esc(degrees(value)) + '</strong>'
      + '<span class="compare-loft-basis">' + esc(value === null ? '資料未確認' : basisLabel(club)) + '</span>';
  }

  const api = Object.freeze({ rows, getLoft, degrees, basisLabel, badge, detail, comparison });
  root.ArchiveLofts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
