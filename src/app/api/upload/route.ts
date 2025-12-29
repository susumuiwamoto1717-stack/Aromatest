import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

export const runtime = "nodejs";

type UploadBody = {
  name?: string;
  content?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadBody;
    if (!body.name || !body.content) {
      return NextResponse.json(
        { error: "name と content は必須です" },
        { status: 400 },
      );
    }

    const bucketName = process.env.GCS_BUCKET;
    const key = process.env.GCP_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.GCP_PROJECT_ID;

    if (!bucketName) {
      return NextResponse.json(
        { error: "GCS_BUCKET が設定されていません" },
        { status: 500 },
      );
    }

    const credentials = key ? JSON.parse(key) : undefined;
    const storage = new Storage({
      projectId: projectId || credentials?.project_id,
      credentials,
    });

    const file = storage.bucket(bucketName).file(body.name);
    await file.save(body.content, {
      contentType: "application/json",
      resumable: false,
    });

    return NextResponse.json({
      message: `アップロードしました: gs://${bucketName}/${body.name}`,
      path: `${bucketName}/${body.name}`,
    });
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json(
      { error: "アップロード処理でエラーが発生しました" },
      { status: 500 },
    );
  }
}
