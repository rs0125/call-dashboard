import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Read-only R2 access for the dashboard: it only ever presigns GET URLs for
// call recordings the Go exotel-call-service archived to R2 (private bucket
// `exotel-calls`, keys like `recordings/<sid>/<exotel_sid>.mp3` stored in
// calls.recording_r2_key). Mirrors the reimbursement portal's lib/r2.ts.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return _client;
}

// Presigned GET URL for an R2 object. Default 1h expiry comfortably covers a
// listen-through-and-seek session. ResponseContentType pins audio/mpeg so the
// browser plays it inline even if the stored object lacks a content-type.
export async function getRecordingUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: required("R2_BUCKET"),
    Key: key,
    ResponseContentType: "audio/mpeg",
    ResponseContentDisposition: "inline",
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}
