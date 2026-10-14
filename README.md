# Amazon S3 Movie Poster Search

This demo uses Amazon S3 general purpose buckets with Next.js to fetch movie
metadata and poster images. It securely connects to S3 without hardcoded access
tokens through Vercel's
[OIDC Federation](https://vercel.com/docs/security/secure-backend-access/oidc).

[![This is an alt text.](/public/Vercel-AWS-GitHub-s3.png)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-s3-general-purpose-buckets-demo&project-name=aws-s3-general-purpose-buckets-demo&repository-name=aws-s3-general-purpose-buckets-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-s3%22%2C%22protocol%22%3A%22storage%22%7D%5D)

<!-- TODO: add the hosted demo URL here. -->

## Getting Started

Click the "Deploy" button to clone this repo, create a new Vercel project, set up
the AWS integration, and provision a new S3 general purpose bucket:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-s3-general-purpose-buckets-demo&project-name=aws-s3-general-purpose-buckets-demo&repository-name=aws-s3-general-purpose-buckets-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-s3%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The first deployment fills the bucket on its own: before building, it downloads
the posters and uploads them with the catalog. Later deployments find the
catalog already in the bucket and skip straight to the build.

To connect a bucket to an existing project instead, use the Vercel AWS Native
Integration. It provisions an IAM role and adds the required S3 environment
variables to the Vercel project.

To fill the bucket from your machine instead, run `npm run sync:s3`. It uploads
straight to the private bucket using Vercel OIDC credentials, skipping posters
that are already there. The catalog contains 4,395 poster-backed movies from the
[TMDB 5000 Movie Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata);
movies without a confirmed poster are omitted.

For complete preparation, upload, verification, and troubleshooting steps,
see the [S3 and Vercel setup guide](docs/setup-guide.md).

## Requirements

- Installed Amazon S3 through the
  [Vercel AWS Marketplace integration](https://vercel.com/marketplace/aws)
- Node.js 20 or newer
- The [Vercel CLI](https://vercel.com/docs/cli)

## Local Setup

1. Link the directory to a Vercel project and pull its environment variables:

   ```bash
   npx vercel link
   npx vercel env pull .env.local
   ```

   `vercel env pull` reads the project's **Development** environment. The Deploy
   button connects the bucket to every environment, but connecting it from the
   dashboard leaves Development unchecked by default. If `.env.local` has no
   `S3_BUCKET_NAME`, edit the bucket's project connection, enable Development,
   and pull again.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Upload the catalog and posters to the connected S3 bucket, if a deployment
   has not already done it:

   ```bash
   npm run sync:s3
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. View local development at [http://localhost:3000](http://localhost:3000).

The S3 bucket remains private. Vercel exchanges its OIDC token for temporary
AWS credentials, and poster responses are cached on Vercel's CDN.

This product uses the TMDB API but is not endorsed or certified by TMDB.
