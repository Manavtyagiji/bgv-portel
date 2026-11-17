// bgv-backend/utils/s3.js
//
// Dedicated S3 client for this portal's own bucket/credentials, read ONLY
// from the BGV_S3_* env vars. Never touches any other S3 config in .env —
// this AWS account also hosts other portals with their own buckets/creds.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Read lazily (inside functions), never at module-load time: server.js calls
// dotenv.config() AFTER importing the route chain that reaches this module,
// so top-level `process.env.BGV_S3_*` reads here would capture `undefined`.
function bucket() {
  return process.env.BGV_S3_BUCKET;
}

let client = null;
function getClient() {
  if (client) return client;
  client = new S3Client({
    region: process.env.BGV_S3_REGION,
    credentials: {
      accessKeyId: process.env.BGV_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BGV_S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export async function uploadBufferToS3(buffer, key, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/pdf",
    })
  );
  return key;
}

// Returns { exists: true, size } if the object is present, { exists: false } otherwise.
// Used by the migration script to verify an upload actually landed before
// marking a record migrated — never assume success from PutObject alone.
export async function headObjectInfo(key) {
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return { exists: true, size: res.ContentLength };
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw err;
  }
}

// Short-lived signed URL — the bucket itself stays private. Default 5 minutes
// is enough for a browser to open/download a report right after the request.
export async function getPresignedViewUrl(key, expiresInSeconds = 300) {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

// Downloads an object into memory — used where the file bytes are needed
// directly (e.g. attaching a report to an outgoing email) rather than a URL.
export async function downloadObjectBuffer(key) {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key })
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}
