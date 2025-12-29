# Aroma Spread Trainer

spread_all.md 形式の見開きマークダウンをそのままクイズ化する Next.js + Tailwind アプリです。フォントや配色は提示してもらったアロマのデモに合わせています。

## セットアップ

```bash
npm install
npm run dev -- --port 5801
# http://localhost:5801 で確認

# チェック
npm run lint
```

## 使い方

- `public/spread_all.md` を自動で読み込みます（元データ: 100_vibe writing/061_Aroma book/03_outputs/spread_all.md）。
- 画面左上「マークダウンを読み込む」から別の .md を選ぶと即座にパースして表示が入れ替わります。
- 左ページ = 問題、右ページ = 解説として表示。「解説を見る」で開閉できます。
- 「並び順をシャッフル」で出題順をランダム化できます。
- 「Google Cloud にアップロード」はパース結果(JSON)を GCS バケットに保存します（環境変数が設定されている場合のみ動作）。

## Google Cloud Storage アップロード

1. `.env.local` を作成してサービスアカウント情報を設定します。

```bash
GCS_BUCKET=your-bucket-name
GCP_PROJECT_ID=your-project-id
# サービスアカウント JSON をそのまま文字列で
GCP_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n..."}'
```

2. サービスアカウントに `Storage Object Admin` 以上を付与してください。  
3. 開発サーバー再起動後、画面のアップロードボタンで `gs://$GCS_BUCKET/{ファイル名}.json` に保存されます。

## Cloud Run デプロイ（例）

```bash
PROJECT_ID=your-project-id
REGION=asia-northeast1
IMAGE=gcr.io/$PROJECT_ID/aroma-trainer

gcloud auth login
gcloud config set project $PROJECT_ID
gcloud builds submit --tag $IMAGE
gcloud run deploy aroma-trainer \
  --image $IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GCS_BUCKET=your-bucket-name,GCP_PROJECT_ID=$PROJECT_ID,GCP_SERVICE_ACCOUNT_KEY="$GCP_SERVICE_ACCOUNT_KEY"
```

デプロイに使うサービスアカウントにも GCS への書き込み権限を付与してください。

## データフォーマットの前提

各問題は以下のように挟まれている前提でパースしています。

```
### F11-Q001
<<<SPREAD_START>>>
[LEFT]
**問題文**

**答え：〇**
[/LEFT]
<<<RIGHT_PAGE>>>
[RIGHT]
**解説：** 説明文
[/RIGHT]
[SOURCE]元ファイル[/SOURCE]
<<<SPREAD_END>>>
```

「問題文」「答え：〇/✕」「解説」を検出し、UIに反映します。フォーマットが変わる場合は `src/lib/parseSpread.ts` の抽出ロジックを調整してください。
