# Amazon S3 Movie Poster Search

This demo uses Amazon S3 general purpose buckets with Next.js to fetch movie
metadata and poster images. It securely connects to S3 without hardcoded access
tokens through Vercel's
[OIDC Federation](https://vercel.com/docs/security/secure-backend-access/oidc).

[![This is an alt text.](/public/Vercel-AWS-GitHub-apg.png)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Faws-s3-general-purpose-buckets-demo&project-name=aws-s3-general-purpose-buckets-demo&repository-name=aws-s3-general-purpose-buckets-demo&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22aws%22%2C%22productSlug%22%3A%22aws-s3%22%2C%22protocol%22%3A%22storage%22%7D%5D)

**Demo:** [View Demo](https://s3-vercel-general-purpose-buckets.vercel.app/)

## Getting Started

Connect an Amazon S3 general purpose bucket to the project through the Vercel
AWS Native Integration. The integration provisions an IAM role and adds the
required S3 environment variables to the Vercel project.

Prepare the movie catalog and posters locally, then run `npm run upload:s3`.
The command uploads the files directly to the private S3 bucket using Vercel
OIDC credentials. The catalog contains 4,395 poster-backed movies from the
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

2. Install dependencies:

   ```bash
   npm install
   ```

3. Prepare the catalog and poster files:

   ```bash
   npm run prepare:static
   ```

4. Upload the files directly to the connected S3 bucket:

   ```bash
   npm run upload:s3
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

6. View local development at [http://localhost:3000](http://localhost:3000).

The S3 bucket remains private. Vercel exchanges its OIDC token for temporary
AWS credentials, and poster responses are cached on Vercel's CDN.

This product uses the TMDB API but is not endorsed or certified by TMDB.
