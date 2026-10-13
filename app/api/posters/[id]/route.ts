import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  isMissingObject,
  legacyAssetBaseUrl,
  requireBucketName,
  s3
} from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

async function loadPoster(id: string) {
  const bucket = requireBucketName();
  const key = `posters/${id}.jpg`;
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    if (!response.Body) {
      throw new Error("The S3 poster object was empty.");
    }
    return {
      bytes: new Uint8Array(await response.Body.transformToByteArray()),
      contentType: response.ContentType ?? "image/jpeg",
      etag: response.ETag,
      lastModified: response.LastModified
    };
  } catch (error) {
    if (!isMissingObject(error)) throw error;

    const source = await fetch(`${legacyAssetBaseUrl}/${key}`);
    if (!source.ok) {
      if (source.status === 404) return null;
      throw new Error(`Legacy poster request failed: ${source.status}`);
    }
    const bytes = new Uint8Array(await source.arrayBuffer());
    const contentType = source.headers.get("content-type") ?? "image/jpeg";
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { tmdb_id: id }
      })
    );
    return { bytes, contentType };
  }
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return new Response("Invalid movie ID.", { status: 400 });
  }

  try {
    const poster = await loadPoster(id);
    if (!poster) {
      return new Response("Poster not found.", { status: 404 });
    }

    const headers = new Headers({
      "Cache-Control":
        "public, max-age=31536000, s-maxage=31536000, immutable",
      "Content-Type": poster.contentType
    });
    if (poster.etag) headers.set("ETag", poster.etag);
    if (poster.lastModified) {
      headers.set("Last-Modified", poster.lastModified.toUTCString());
    }

    return new Response(poster.bytes, { headers });
  } catch (error) {
    console.error(`Could not load poster ${id} from S3.`, error);
    return new Response("Could not load poster.", { status: 502 });
  }
}
