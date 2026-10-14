# Build a searchable movie catalog with Amazon S3 and Vercel

This demo uses an Amazon S3 general purpose bucket with Next.js and Vercel.
The private bucket stores a JSON catalog and 4,395 movie posters from the TMDB
5000 dataset. Vercel accesses S3 with temporary credentials from OIDC, so the
project does not store AWS access keys.

## Prerequisites

- A Vercel project containing this application
- The Vercel AWS Native Integration connected to an AWS account
- Node.js 20 or newer
- The Vercel CLI

You do not need direct access to the AWS account after the S3 resource has been
connected to the Vercel project.

## 1. Connect an S3 general purpose bucket

1. Open the project in Vercel.
2. Open the AWS Native Integration.
3. Create or select an Amazon S3 general purpose bucket.
4. Connect the bucket to the project and the environments that will use it.

The integration adds these environment variables to the project:

```text
AWS_ACCOUNT_ID
AWS_REGION
AWS_RESOURCE_ARN
AWS_ROLE_ARN
S3_BUCKET_NAME
```

Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`. Vercel uses OIDC to
assume the provisioned IAM role at runtime.

## 2. Install the project

From the project directory, install its dependencies:

```bash
npm install
```

The application uses the AWS SDK for S3 and `@vercel/oidc` for temporary
credentials.

## 3. Link the local directory to Vercel

```bash
npx vercel link
npx vercel env pull .env.local
```

Confirm that `.vercel` and `.env*` are ignored by Git before committing code.

## 4. Upload the catalog and posters

Every deployment runs this step before building, so if you deploy first you can
skip it. To fill the bucket from your machine:

```bash
npm run sync:s3
```

The sync reads the integration settings and OIDC token from `.env.local`,
assumes the provisioned IAM role, and writes directly to the private bucket. It
does not create public objects or require static AWS access keys.

It reads `lib/demo-catalog.json`, checks each poster in the bucket, downloads
only the missing ones from TMDB, and skips movies without an available poster.
It writes `catalog/movies.json` last, so once the catalog exists later runs and
deployments return immediately. Run `npm run sync:s3 -- --force` to rebuild the
catalog; posters already in the bucket are still skipped.

A complete first sync ends with:

```text
[sync:s3] Uploaded 4395 new posters. catalog/movies.json lists 4395 movies; 259 had no poster available.
```

## 5. Deploy the application

```bash
npx vercel --prod
```

When the command finishes, open the production URL. A protected deployment may
ask you to sign in to Vercel.

## 6. Verify the catalog and a poster

Use the Vercel CLI to make authenticated requests through deployment
protection:

```bash
npx vercel curl /api/catalog | jq length
```

The catalog should contain:

```text
4395
```

Download one poster:

```bash
npx vercel curl '/api/posters/211672?verify=1' \
  -- --output /tmp/poster.jpg

file /tmp/poster.jpg
```

The file should be reported as a JPEG image.

To confirm that the S3 object is not public, request it without authentication:

```bash
curl -I \
  'https://<bucket-name>.s3.<aws-region>.amazonaws.com/catalog/movies.json'
```

The expected response is `403 Forbidden`.

## 7. Try the demo

Search by movie title, release year, director, cast member, or genre. Multiple
search terms must all match. Results can be sorted by popularity, rating,
release year, or title.

## How it works

1. The browser requests `/api/catalog` when the page loads.
2. Vercel supplies an OIDC token to the Next.js function.
3. The AWS SDK exchanges the token for temporary credentials for the
   integration's IAM role.
4. The catalog route reads `catalog/movies.json` from the private S3 bucket.
5. Poster routes read `posters/{tmdb-id}.jpg` from S3.
6. Vercel caches poster responses at the edge for fast repeat requests.
7. Search and sorting happen in the browser after the catalog loads.

The bucket remains private, and neither the browser nor the repository receives
AWS access keys.

## Troubleshooting

View recent production errors with:

```bash
npx vercel logs \
  --environment production \
  --level error \
  --since 30m \
  --expand
```

- `CredentialsProviderError` means the function did not receive usable OIDC
  credentials. Confirm the AWS resource is connected to the deployment
  environment, then redeploy.
- `AccessDenied` for an object means the integration role cannot read or write
  that S3 key.
- `/api/catalog` returning 503 means the catalog has not been uploaded yet.
  Redeploy, or run `npm run sync:s3`.
- A failed sync should be retried after confirming that `.env.local` contains
  the integration variables and a current `VERCEL_OIDC_TOKEN`. It resumes where
  it stopped.
