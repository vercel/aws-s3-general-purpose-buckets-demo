import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isMissingObject, requireBucketName, s3 } from "@/lib/s3";

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
    if (isMissingObject(error)) return null;
    throw error;
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
      // Cache misses on the CDN so repeated requests for an ID that has no
      // poster don't each reach S3.
      return new Response("Poster not found.", {
        status: 404,
        headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" }
      });
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
