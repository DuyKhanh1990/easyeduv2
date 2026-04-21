import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const endpoint = process.env.S3_ENDPOINT!;
const region = process.env.S3_REGION!;
const bucket = process.env.S3_BUCKET!;
const folder = process.env.S3_FOLDER_PORTAL || "uploads";
const aliasHost = process.env.S3_HOSTNAME || process.env.S3_ALIAS_HOST!;
const protocol = process.env.S3_PROTOCOL || "https";

export const s3Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export async function uploadFileToS3(
  fileBuffer: Buffer | Readable,
  filename: string,
  mimetype: string
): Promise<string> {
  const timestamp = Date.now();
  // Strip leading folder prefix from filename to prevent duplication (e.g. "easyedu/file.jpg" → "file.jpg")
  const strippedName = filename.startsWith(folder + "/")
    ? filename.slice(folder.length + 1)
    : filename;
  const safeName = strippedName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const key = `${folder}/${timestamp}_${safeName}`;
  console.log("S3 KEY:", key);

  const body = fileBuffer instanceof Readable
    ? await streamToBuffer(fileBuffer)
    : fileBuffer;

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: mimetype,
    ACL: "public-read",
  }));

  const fileUrl = `${protocol}://${aliasHost}/${bucket}/${key}`;
  return fileUrl;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
