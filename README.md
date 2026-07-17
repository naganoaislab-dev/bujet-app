# My Local App

iPhone SafariとGitHub Pages向けの、依存ライブラリを使わない静的PWAの初期構成です。

## 機能

- 初回読み込み後のオフライン起動（Service WorkerによるApp Shellキャッシュ）
- iPhoneのホーム画面追加、セーフエリア、ダークモード対応
- IndexedDBへのテストデータ保存・読込
- IndexedDB全件のJSONエクスポート・インポート
- オンライン／オフライン状態表示
- GitHub Pagesのリポジトリ配下など、サブディレクトリ配信対応

## ローカル確認

Service Workerは `file://` では動作しません。任意の静的HTTPサーバーでリポジトリのルートを配信してください。たとえばPythonがある環境では次のコマンドが使えます。

```sh
python -m http.server 8000
```

その後、`http://localhost:8000/` を開きます。初回表示後に再読み込みし、開発者ツールでオフラインに切り替えて起動できることを確認します。

## GitHub Pages

リポジトリの Settings → Pages で、公開ブランチとルートディレクトリを選択します。すべての参照、manifestの `start_url` / `scope`、Service Worker登録とキャッシュURLを相対指定しているため、`https://<user>.github.io/<repository>/` のようなサブパスで動作します。

HTTPSで初回アクセス後、Safariの共有メニューから「ホーム画面に追加」を選択できます。

## データ形式

JSONバックアップは次の形です。インポート時は `app`、`version`、`records` と各レコードの文字列 `id` を検証します。

```json
{
  "app": "My Local App",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "records": []
}
```

## 更新時の注意

キャッシュ対象ファイルを変更したら、`sw.js` の `CACHE_VERSION` も更新してください。IndexedDBの構造を変更する場合は `DB_VERSION` を増やし、`onupgradeneeded` に移行処理を追加します。

## 制約

- オフライン起動には、オンライン状態で一度最後まで読み込み、Service Workerのインストールを完了する必要があります。
- SafariのプライベートブラウズやOSのストレージ整理により、端末内データが削除される場合があります。重要なデータはJSONでバックアップしてください。
- iOSのホーム画面アイコン表示はOSバージョンによりSVGの扱いが異なるため、本番公開時は180×180のPNG版 `apple-touch-icon` を追加することを推奨します。
