import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import {
  PutObjectCommand,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";

const catalogPath = resolve("public/catalog/movies.json");
const posterDirectory = resolve("public/posters");

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
}

async function main() {
  config({ path: ".env.local", quiet: true });
  // `vercel pull` writes here instead of .env.local.
  config({ path: ".vercel/.env.development.local", quiet: true });
  const { requireBucketName, s3 } = await import("../lib/s3");
  const bucket = requireBucketName();

  async function putObject(input: Omit<PutObjectCommandInput, "Bucket">) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, ...input }));
  }

  const [catalog, posterFiles] = await Promise.all([
    readFile(catalogPath),
    readdir(posterDirectory)
  ]);
  const jpgFiles = posterFiles.filter((file) => file.endsWith(".jpg"));

  console.log(`Uploading catalog and ${jpgFiles.length} posters to ${bucket}…`);
  await putObject({
    Key: process.env.S3_CATALOG_KEY ?? "catalog/movies.json",
    Body: catalog,
    ContentType: "application/json",
    CacheControl: "no-cache"
  });

  await mapWithConcurrency(jpgFiles, 12, async (file, index) => {
    const path = resolve(posterDirectory, file);
    const details = await stat(path);
    await putObject({
      Key: `posters/${file}`,
      Body: createReadStream(path),
      ContentLength: details.size,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: { tmdb_id: file.replace(/\.jpg$/, "") }
    });
    if ((index + 1) % 100 === 0) {
      console.log(`Uploaded ${index + 1}/${jpgFiles.length} posters`);
    }
  });

  console.log(`Uploaded ${jpgFiles.length} posters and catalog/movies.json.`);
}

void main();
