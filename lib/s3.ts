import { S3Client } from "@aws-sdk/client-s3";
import { fromWebToken } from "@aws-sdk/credential-provider-web-identity";
import { getVercelOidcToken } from "@vercel/oidc";

const region = process.env.AWS_REGION ?? "us-east-1";
const roleArn = process.env.AWS_ROLE_ARN;

export const bucketName = process.env.S3_BUCKET_NAME;
export const legacyAssetBaseUrl = (
  process.env.LEGACY_ASSET_BASE_URL ??
  "https://d1edv93n89rnpj.cloudfront.net"
).replace(/\/$/, "");

async function getVercelCredentials() {
  if (!roleArn) {
    throw new Error("AWS_ROLE_ARN is not configured.");
  }

  const webIdentityToken = await getVercelOidcToken();
  return fromWebToken({
    roleArn,
    webIdentityToken,
    roleSessionName: "vercel-s3-movie-search"
  })();
}

export const s3 = new S3Client({
  region,
  // Vercel sends its OIDC token in the function's request context. Resolve it
  // when the AWS SDK requests credentials instead of reading it at module load.
  credentials: roleArn ? getVercelCredentials : undefined
});

export function requireBucketName() {
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is not configured.");
  }
  return bucketName;
}

export function isMissingObject(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";

  return (
    name === "NoSuchKey" ||
    name === "NotFound" ||
    // S3 deliberately returns 403 instead of 404 for a missing key when the
    // caller can access objects but does not have s3:ListBucket permission.
    (name === "AccessDenied" && message.includes("s3:ListBucket"))
  );
}
