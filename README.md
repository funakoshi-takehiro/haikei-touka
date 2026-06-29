# 背景透過 (haikei-touka)

アップロードした画像の背景を **ブラウザ内のAI処理** で自動透過する Web ツール。
画像は端末内だけで処理され、外部サーバーには一切送信されません。

## 特長

- 🖼 画像を選択 → 自動で背景透過 → ダウンロード
- 📁 複数画像・フォルダ単位の一括処理（個別DL／すべてDL）
- 🎨 出力形式を PNG / WebP から選択
- 🔒 完全クライアントサイド処理（プライバシー保護）
- 🌐 日本語 / 英語 切替

## 技術構成

- Vite + Vanilla TypeScript（軽量・依存最小）
- [@imgly/background-removal](https://github.com/imgly/background-removal-js)（WASM/WebGPU、ブラウザ内AI）
- フォント: Zen Kaku Gothic New / テーマカラー `#028DAE`

## 開発

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバー（http://localhost:5173）
npm run build    # 本番ビルド → dist/
npm run preview  # ビルド結果をローカル確認
```

## デプロイ（GitHub Pages）

`main` ブランチに push すると GitHub Actions が自動でビルド＆デプロイします。
初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に設定してください。

公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

> アセット参照は相対パス（`base: "./"`）のため、リポジトリ名に依存せず動作します。
