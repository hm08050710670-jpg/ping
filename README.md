# PING CLUB ARCHIVE / GOLF GUTS

個人用の歴代クラブ資料サイト。ドライバー、フェアウェイウッド、ハイブリッド（アイアン型UTを含む）、アイアン、ウェッジ、パターを検索・比較できます。

G440 / G430 / G425 / G410のボタンから、世代ごとのクラブをまとめて表示できます。G400以前〜G2も最初から展開して表示します。世代の選択は検索・種類・年代などの条件をリセットし、URLの `generation` に反映します。世代の分類は `dist/core.js` の `generations` と `generationOf` で定義し、説明文中の別モデル名やG LE・G MAX・G700・G740を含めないようにしています。

ページ先頭にはPINGロゴ・G440 Kの写真・説明を含む表紙を置き、その下に「クラブを探す」とGシリーズ選択欄を続けます。「Gシリーズをすぐ見る」の追加ジャンプボタンは設けません。

「歴代年表」ではGシリーズの選択欄と専用の結果見出しを非表示にし、「クラブ一覧」や「保存」へ戻ると再表示します。選択中のシリーズや検索条件は維持します。

## 起動・確認方法

ビルド不要の静的サイトです。配信ディレクトリは `dist` です。

```sh
python3 -m http.server 8080 --directory dist
# http://localhost:8080/ を開く
```

`dist/index.html` をファイルとして直接開いても動作します（フォント・写真・データはすべて `dist` 内に同梱）。

## 構成

- `data/catalog.json`: 出典と年代の基準を含む編集用データ（モデル情報の唯一の基準）。
- `data/audits/2026-10-20.json`, `docs/catalog-audit-2026-10-20.md`: 全231項目の監査記録。`before` の値は現在の掲載値ではありません。
- `scripts/build-data.py`: `catalog.json` を検証し、`dist/data.js` を生成。
- `scripts/verify-data.py`: `catalog.json` と `dist/data.js` を監査基準（件数・ロフト表・未確認項目）と照合。
- `scripts/verify-core.cjs`, `scripts/verify-lofts.cjs`: 検索・世代判定・保存データ・ロフト表示のコード検証（Node）。
- `scripts/verify-browser.py`: 実ブラウザー（Playwright + Chromium）で納品チェックリストを実行。
- `dist/index.html`: 画面構成と文章。
- `dist/styles.css`, `dist/lofts.css`: 配色・レイアウト。
- `dist/data.js`: 生成データ（直接編集しない）。
- `dist/core.js`: 検索、絞り込み、並び替え、世代判定、比較数制限、保存データ、URL状態（DOMに依存しない）。
- `dist/lofts.js`: アイアンの7番ロフト表示、番手別ロフト表、比較欄。一覧・詳細・比較は同じ `ironLofts` を参照。
- `dist/app.js`: 画面の描画・ダイアログ・保存・比較・イベント処理。
- `dist/fonts.css` / `dist/assets/fonts/`: Noto Sans JPとPoppinsのローカル配信データとライセンス。
- `dist/assets/branding/`: 承認済みロゴ（変更しない）。
- `dist/assets/`: 確認済みの公式製品写真。

外部JavaScript、外部フォント、解析サービスに依存しません。

## データの編集・更新方法

1. `data/catalog.json` を編集する（モデルIDは変更しない。保存データがIDに紐づくため）。
2. `python3 scripts/build-data.py` を実行して `dist/data.js` を再生成する。
3. `python3 scripts/verify-data.py` と `node scripts/verify-core.cjs`、`node scripts/verify-lofts.cjs` を実行する。
4. 必要に応じて `python3 scripts/verify-browser.py`（要 `pip install playwright && python3 -m playwright install chromium`）を実行する。

`verify-data.py` は監査基準との差（全231件・カテゴリ別件数・57表561行・ロフト未確認5件・年未確認11件）を検出します。意図してデータを変更した場合は、`data/audits/` に根拠を記録したうえで、基準値の変更として扱ってください。

## 収録方針

歴代の主要モデル・シリーズを収録。世代と派生モデルを混在して紹介しているため、件数は「掲載項目」と表記します。全限定仕様、全パターヘッド形状、全シャフト、ジュニア用品などを網羅するものではありません。

国内発売日を一次資料で確認できる場合は国内発売年を優先します。他の年代根拠や原資料を取得できない項目には明示的な注記を保持してください。モデル名やURL中の年を、発売年とみなさないでください。海外のメーカー発表年・登場年と国内発売年を混同しないでください。

写真は出典とのモデル対応を確認してから追加してください。代表仕様の写真は `imageAlt` に対象モデルを明記します。写真未収録時・読み込み失敗時は汎用のカテゴリ記号を表示します。実物と異なる製品写真を代用しないでください。

アイアンのロフトは `ironLofts` に番手ごとの数値・仕様区分（`basis` / `basisLabel`）・出典（`sourceUrls`）・確認日（`verifiedAt`）・注記（`note`）を保存します。国内公式掲載仕様、パワーロフト、米国公式標準などを混同しないでください。番手名（PW・UW・W・U・S・L・45・50 など）は公式表記のまま保持し、小数値を丸めません。未確認のモデルには値を推測して追加しません。一覧と比較の7番表示も同じロフト表から取得します。

## デザイン

承認済み基準：背景 `#F8F5EF`、文字 `#2B2622`、アクセント `#C9A77C`。日本語はNoto Sans JP、英数字はPoppins。主要ボタンはベージュ背景と濃色文字を使用します。フォントの再取得は `python3 scripts/download-fonts.py` で行います。

`dist/assets/branding/` のロゴは、利用者から提供されたPINGのIllustratorデータとGOLF GUTSのPDFのベクターパスを使用しています。GOLF GUTSは濃色版と「DESIGN YOUR GOLF LIFE」を一体で保持。形状、縦横比、原色（PING `#2c292a` / GOLF GUTS `#231916`）、PINGの®を変更せず、用紙背景を除去して周囲に3%の透明余白を設けています。フォントへの置き換えや画像への再描画はしていません。

## 保存・アクセス

Sitesの所有者本人用の公開範囲を維持します。お気に入りとメモはこのサイトのブラウザーの `localStorage`（キー `golf-guts-ping-archive-v1`、構造 `{ version: 1, favorites: [モデルID], notes: { モデルID: メモ本文 } }`）に保存され、端末間では同期されません。公開URLが変わると旧サイトの保存内容は自動では引き継がれません。モデルデータは自動更新されません。

## 確認

資料確認日: 2026-10-20。全231項目を再監査し、既存のアイアン56表・549行を公式資料から独立抽出して照合しました。既存のロフト角は全行一致。i3+の12行を追加し、57表・561行を収録しています。確認できない5モデルのロフトは未掲載です。

再監査の結果と全モデルの確認記録は `docs/catalog-audit-2026-10-20.md`、根拠URL・数値照合・変更前後の値を含む監査データは `data/audits/2026-10-20.json` に保存しています。この監査は掲載項目の確認であり、全地域・全カスタム仕様を網羅したという意味ではありません。
