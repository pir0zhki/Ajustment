# 日程調整ツール

GitHub Pages で動く、静的HTML＋Firebase（Firestore）の日程調整ツールです。
1時間単位で「○ 参加可能 / △ 未定 / × 参加不可」を入力し、全員の回答を集計します。

## 機能

- イベント作成（カレンダーで候補日を選択、時間帯を1時間単位で指定）
- 共有URLの発行とコピー
- 回答入力：ブラシ（○/△/×）を選んでクリック・ドラッグで塗る（スマホのタッチ操作にも対応）
  - 初期状態はすべて○。都合の悪い時間だけ塗る
  - 日付・時刻の見出しクリックで行・列をまとめて塗る
  - 「すべて○」「すべて×」「前の週からコピー」
- 同じ名前で送信すると上書き（回答者一覧の名前クリックで内容を呼び出し）
- 集計表：各マスの ○/△/× の人数と色分け、マスをクリックすると回答者の内訳を表示
- おすすめの時間帯 TOP3（連続する時間はまとめて表示）
- 他の人の回答がリロードなしで反映（リアルタイム更新）

## ファイル構成

```
index.html            イベント作成
event.html            回答・集計
css/style.css
js/firebase-config.js Firebaseの接続設定（ここを書き換える）
js/db.js              データアクセス（Firestore / デモモード）
js/grid.js            入力グリッド
js/summary.js         集計表・おすすめ候補
js/create.js          index.html 用
js/event.js           event.html 用
firestore.rules       Firestore セキュリティルール
```

## 1. まずローカルで試す（デモモード）

`js/firebase-config.js` が初期値のままだと **デモモード** で動きます。
データはそのブラウザの localStorage にだけ保存されます。

ES Modules を使っているため、ファイルを直接ダブルクリックで開くと動きません。
簡易サーバーを起動して開いてください。

```bash
cd このフォルダ
python3 -m http.server 8000
# → http://localhost:8000/ を開く
```

## 2. Firebase の準備

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成
   （Google アナリティクスは不要）
2. 左メニュー「構築 > Firestore Database」→「データベースを作成」
   - ロケーション：`asia-northeast1`（東京）がおすすめ
   - 「本番環境モード」で開始
3. Firestore の「ルール」タブを開き、`firestore.rules` の中身を貼り付けて「公開」
4. 「プロジェクトの設定（歯車）> マイアプリ」で「ウェブ（</>）」を選んでアプリを登録
   （Firebase Hosting の設定は不要）
5. 表示された `firebaseConfig` の値を `js/firebase-config.js` にコピー

> `firebaseConfig` の値はブラウザに公開される前提の値なので、GitHub に push して問題ありません。
> データの保護はセキュリティルールで行います。

## 3. GitHub Pages で公開

1. このフォルダを GitHub リポジトリに push
2. リポジトリの「Settings > Pages」で
   - Source：`Deploy from a branch`
   - Branch：`main` / `/ (root)`
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

## 運用上の注意

- **無料枠（Spark プラン）**：読み取り 5万回/日、書き込み 2万回/日。
  ページを開くたびに「イベント1件＋回答数」ぶんの読み取りが発生します。小〜中規模の利用なら十分です。
- **上書き方式**：同じ名前なら誰でも上書きできる簡易方式です（PDFのツールと同じ）。
  URLを知っている人だけがアクセスできる前提で運用してください。
- **任意の追加対策**：Google Cloud コンソールで API キーに「HTTP リファラー制限」
  （`https://<ユーザー名>.github.io/*`）を付けると、他サイトからの利用を防げます。
- イベントの削除や編集は、Firebase コンソールの Firestore 画面から行えます。

https://pir0zhki.github.io/Ajustment/