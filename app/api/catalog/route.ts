import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Movie } from "@/lib/types";
import {
  isMissingObject,
  legacyAssetBaseUrl,
  requireBucketName,
  s3
} from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const catalogKey = process.env.S3_CATALOG_KEY ?? "catalog/movies.json";

async function loadCatalog() {
  const bucket = requireBucketName();
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: catalogKey
      })
    );
    if (!response.Body) {
      throw new Error("The S3 catalog object was empty.");
    }
    return response.Body.transformToString();
  } catch (error) {
    if (!isMissingObject(error)) throw error;

    const source = await fetch(`${legacyAssetBaseUrl}/${catalogKey}`);
    if (!source.ok) {
      throw new Error(`Legacy catalog request failed: ${source.status}`);
    }
    const catalog = await source.text();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: catalogKey,
        Body: catalog,
        ContentType: "application/json",
        CacheControl: "no-cache"
      })
    );
    return catalog;
  }
}

export async function GET() {
  try {
    const catalog = JSON.parse(await loadCatalog()) as Movie[];
    const movies = catalog.map((movie) => ({
      ...movie,
      posterUrl: `/api/posters/${movie.id}`
    }));

    return Response.json(movies, {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
      }
    });
  } catch (error) {
    console.error("Could not load the S3 movie catalog.", error);
    return Response.json(
      { error: "Could not load the movie catalog from S3." },
      { status: 502 }
    );
  }
}
