import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parse } from "csv-parse/sync";
import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput
} from "@aws-sdk/client-s3";
import type { Movie } from "../lib/types";

type MovieRow = {
  id: string;
  title: string;
  release_date: string;
  genres: string;
  overview: string;
  vote_average: string;
  vote_count: string;
  popularity: string;
  runtime: string;
};

type CreditsRow = {
  movie_id: string;
  cast: string;
  crew: string;
};

type Person = {
  name: string;
  job?: string;
  order?: number;
};

type TmdbDetails = {
  poster_path: string | null;
};

const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => [value, all[index + 1]] as const)
    .filter(([key]) => key.startsWith("--"))
);
const moviesPath = resolve(args.get("--movies") ?? "data/tmdb_5000_movies.csv");
const creditsPath = resolve(args.get("--credits") ?? "data/tmdb_5000_credits.csv");
const bucket = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION ?? "us-east-1";
const catalogKey = process.env.S3_CATALOG_KEY ?? "catalog/movies.json";
const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
const client = new S3Client({ region });

if (!bucket) throw new Error("S3_BUCKET_NAME is required.");
if (!tmdbToken) throw new Error("TMDB_READ_ACCESS_TOKEN is required.");

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function putObject(input: Omit<PutObjectCommandInput, "Bucket">) {
  await client.send(new PutObjectCommand({ Bucket: bucket, ...input }));
}

async function getTmdbDetails(id: number): Promise<TmdbDetails> {
  const response = await fetch(`https://api.themoviedb.org/3/movie/${id}`, {
    headers: {
      Authorization: `Bearer ${tmdbToken}`,
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`TMDB ${id}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as TmdbDetails;
}

async function buildMovie(
  row: MovieRow,
  credits: CreditsRow | undefined,
  index: number
): Promise<Movie | null> {
  const id = Number(row.id);
  const details = await getTmdbDetails(id);
  if (!details.poster_path) return null;

  const posterResponse = await fetch(
    `https://image.tmdb.org/t/p/w500${details.poster_path}`
  );
  if (!posterResponse.ok) {
    throw new Error(`Poster ${id}: ${posterResponse.statusText}`);
  }
  const posterKey = `posters/${id}.jpg`;
  await putObject({
    Key: posterKey,
    Body: new Uint8Array(await posterResponse.arrayBuffer()),
    ContentType: posterResponse.headers.get("content-type") ?? "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: { tmdb_id: String(id) }
  });

  const cast = parseJson<Person[]>(credits?.cast ?? "[]", [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 5)
    .map((person) => person.name);
  const director = parseJson<Person[]>(credits?.crew ?? "[]", []).find(
    (person) => person.job === "Director"
  )?.name;
  const genres = parseJson<{ name: string }[]>(row.genres, []).map(
    (genre) => genre.name
  );

  if ((index + 1) % 50 === 0) {
    console.log(`Processed ${index + 1} movies`);
  }

  return {
    id,
    title: row.title,
    year: Number(row.release_date?.slice(0, 4)) || 0,
    genres,
    overview: row.overview,
    rating: Number(row.vote_average) || 0,
    voteCount: Number(row.vote_count) || 0,
    popularity: Number(row.popularity) || 0,
    runtime: Number(row.runtime) || 0,
    director,
    cast,
    posterKey,
    accent: "#315f79"
  };
}

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
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        console.warn(`Skipped row ${index + 1}:`, error);
        results[index] = null as R;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

async function main() {
  const [moviesCsv, creditsCsv] = await Promise.all([
    readFile(moviesPath, "utf8"),
    readFile(creditsPath, "utf8")
  ]);
  const movieRows = parse(moviesCsv, {
    columns: true,
    skip_empty_lines: true
  }) as MovieRow[];
  const creditRows = parse(creditsCsv, {
    columns: true,
    skip_empty_lines: true
  }) as CreditsRow[];
  const credits = new Map(creditRows.map((row) => [row.movie_id, row]));

  console.log(`Ingesting ${movieRows.length} movies into s3://${bucket}`);
  await Promise.all([
    putObject({
      Key: `source/${basename(moviesPath)}`,
      Body: moviesCsv,
      ContentType: "text/csv"
    }),
    putObject({
      Key: `source/${basename(creditsPath)}`,
      Body: creditsCsv,
      ContentType: "text/csv"
    })
  ]);

  const movies = (
    await mapWithConcurrency(movieRows, 8, (row, index) =>
      buildMovie(row, credits.get(row.id), index)
    )
  ).filter((movie): movie is Movie => Boolean(movie));

  await putObject({
    Key: catalogKey,
    Body: JSON.stringify(movies),
    ContentType: "application/json",
    CacheControl: "no-cache"
  });
  console.log(`Done: ${movies.length} posters and ${catalogKey} uploaded.`);
}

void main();
