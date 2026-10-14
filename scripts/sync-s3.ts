import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Movie } from "../lib/types";

/**
 * Fills the connected S3 bucket with the movie catalog and posters. Runs before
 * every build via `vercel.json`, and by hand with `npm run sync:s3`.
 *
 * The catalog object is written last, so its presence means a previous sync
 * finished and there is nothing to do: repeat deployments skip straight to the
 * build. An interrupted sync leaves no catalog, and the next run only downloads
 * the posters that are still missing. Pass `--force` to rebuild the catalog
 * anyway (existing posters are still skipped).
 */

const sourcePath = resolve("lib/demo-catalog.json");
const catalogKey = process.env.S3_CATALOG_KEY ?? "catalog/movies.json";
const force = process.argv.includes("--force");

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

function errorStatus(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}

async function downloadPoster(url: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        // Anything this small is a placeholder, not a poster.
        return bytes.byteLength > 1024 ? bytes : null;
      }
      if (response.status === 404) return null;
    } catch {
      // Retry transient network failures below.
    }
    if (attempt < 3) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 400 * 2 ** attempt)
      );
    }
  }
  return null;
}

async function main() {
  config({ path: ".env.local", quiet: true });
  // `vercel pull` writes here instead of .env.local.
  config({ path: ".vercel/.env.development.local", quiet: true });

  if (!process.env.S3_BUCKET_NAME) {
    // Let the deployment build without the bucket; the catalog route explains
    // what is missing until the AWS integration is connected.
    console.warn(
      "[sync:s3] Skipping: S3_BUCKET_NAME is not set. Connect an S3 bucket " +
        "through the AWS integration, then redeploy or run `npm run sync:s3`."
    );
    return;
  }

  const { requireBucketName, s3 } = await import("../lib/s3");
  const bucket = requireBucketName();

  if (!force) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: catalogKey }));
      console.log(
        `[sync:s3] ${catalogKey} is already in ${bucket}; nothing to do. ` +
          "Run `npm run sync:s3 -- --force` to rebuild it."
      );
      return;
    } catch (error) {
      // 404, or 403 when the role cannot list the bucket, both mean "absent".
      const status = errorStatus(error);
      if (status !== 404 && status !== 403) throw error;
    }
  }

  // HeadObject has no response body, so a missing key surfaces only as a
  // status code: 404, or 403 because the integration role cannot list the
  // bucket. Either way the poster still needs uploading.
  async function posterExists(key: string) {
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key })
      );
      return (head.ContentLength ?? 0) > 1024;
    } catch (error) {
      const status = errorStatus(error);
      if (status === 404 || status === 403) return false;
      throw error;
    }
  }

  const movies = JSON.parse(await readFile(sourcePath, "utf8")) as Movie[];
  console.log(`[sync:s3] Syncing ${movies.length} posters to ${bucket}…`);

  let uploaded = 0;
  const available = (
    await mapWithConcurrency(movies, 12, async (movie, index) => {
      const key = `posters/${movie.id}.jpg`;
      if (!(await posterExists(key))) {
        const bytes = movie.posterUrl
          ? await downloadPoster(movie.posterUrl)
          : null;
        if (!bytes) return null;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: "image/jpeg",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: { tmdb_id: String(movie.id) }
          })
        );
        uploaded += 1;
      }
      if ((index + 1) % 500 === 0) {
        console.log(`[sync:s3] Checked ${index + 1}/${movies.length}`);
      }
      return {
        ...movie,
        posterKey: key,
        posterUrl: `/api/posters/${movie.id}`
      };
    })
  ).filter((movie): movie is NonNullable<typeof movie> => movie !== null);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: catalogKey,
      Body: `${JSON.stringify(available)}\n`,
      ContentType: "application/json",
      CacheControl: "no-cache"
    })
  );

  console.log(
    `[sync:s3] Uploaded ${uploaded} new posters. ${catalogKey} lists ` +
      `${available.length} movies; ${movies.length - available.length} had no ` +
      "poster available."
  );
}

main().catch((error) => {
  console.error("[sync:s3] Failed:", error);
  process.exit(1);
});
