import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
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

const moviesPath = resolve("data/tmdb_5000_movies.csv");
const creditsPath = resolve("data/tmdb_5000_credits.csv");
const outputPath = resolve("lib/demo-catalog.json");
const posterCachePath = resolve("data/poster-url-cache.json");
const cachedOnly = process.argv.includes("--cached-only");
const requestedCount = Math.max(
  24,
  Number(process.argv.find((value) => value.startsWith("--count="))?.split("=")[1]) ||
    180
);
const accents = [
  "#315f79",
  "#b35b43",
  "#6e7757",
  "#765b79",
  "#9b774c",
  "#3d716a",
  "#8e5662",
  "#4f6688"
];

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractPoster(html: string) {
  const propertyFirst = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  )?.[1];
  const contentFirst = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  )?.[1];
  return (propertyFirst ?? contentFirst)?.replaceAll("&amp;", "&");
}

let nextRequestAt = 0;

async function wait(milliseconds: number) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForRequestSlot() {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + 325;
  if (delay > 0) await wait(delay);
}

async function resolvePoster(id: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForRequestSlot();
    try {
      const response = await fetch(
        `https://www.themoviedb.org/movie/${id}?language=en-US`,
        {
          headers: {
            accept: "text/html",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
          }
        }
      );
      if (response.ok) {
        const poster = extractPoster(await response.text());
        return poster?.includes("/t/p/") ? poster : undefined;
      }
      if (response.status === 404) return undefined;
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after")) || 5;
        console.warn(`TMDB throttled request; waiting ${retryAfter}s`);
        await wait(retryAfter * 1000);
        continue;
      }
    } catch {
      // Retry transient network failures below.
    }
    if (attempt < 5) await wait(600 * 2 ** Math.min(attempt, 3));
  }
  throw new Error(`TMDB lookup failed after retries for ID ${id}`);
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
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

async function main() {
  const [moviesCsv, creditsCsv, existingCatalog, cachedPosters] =
    await Promise.all([
    readFile(moviesPath, "utf8"),
    readFile(creditsPath, "utf8"),
    readFile(outputPath, "utf8")
      .then((value) => JSON.parse(value) as Movie[])
      .catch(() => [] as Movie[]),
    readFile(posterCachePath, "utf8")
      .then((value) => JSON.parse(value) as Record<string, string | null>)
      .catch(() => ({} as Record<string, string | null>))
  ]);
  const posterCache = new Map<number, string | null>(
    Object.entries(cachedPosters).map(([id, url]) => [Number(id), url])
  );
  for (const movie of existingCatalog) {
    if (movie.posterUrl) posterCache.set(movie.id, movie.posterUrl);
  }
  const rows = (
    parse(moviesCsv, { columns: true, skip_empty_lines: true }) as MovieRow[]
  )
    .filter((row) => row.title)
    .sort((a, b) => Number(b.popularity) - Number(a.popularity))
    .slice(0, requestedCount + 30);
  const creditRows = parse(creditsCsv, {
    columns: true,
    skip_empty_lines: true
  }) as CreditsRow[];
  const credits = new Map(creditRows.map((row) => [row.movie_id, row]));

  console.log(`Resolving posters for ${rows.length} TMDB 5000 films…`);
  const movies = (
    await mapWithConcurrency(rows, 2, async (row, index) => {
      try {
        const id = Number(row.id);
        let posterUrl = posterCache.get(id);
        if (!posterCache.has(id)) {
          if (cachedOnly) return null;
          posterUrl = (await resolvePoster(row.id)) ?? null;
          posterCache.set(id, posterUrl);
        }
        if (!posterUrl) return null;
        const credit = credits.get(row.id);
        const cast = parseJson<Person[]>(credit?.cast ?? "[]", [])
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          .slice(0, 5)
          .map((person) => person.name);
        const director = parseJson<Person[]>(credit?.crew ?? "[]", []).find(
          (person) => person.job === "Director"
        )?.name;
        const genres = parseJson<{ name: string }[]>(row.genres, []).map(
          (genre) => genre.name
        );

        const movie: Movie = {
          id: Number(row.id),
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
          posterUrl,
          accent: accents[Number(row.id) % accents.length]
        };
        return movie;
      } catch (error) {
        console.warn(`Skipped ${row.title}: ${String(error)}`);
        return null;
      } finally {
        if ((index + 1) % 100 === 0) {
          console.log(`Checked ${index + 1}/${rows.length}`);
          await writeFile(
            posterCachePath,
            `${JSON.stringify(Object.fromEntries(posterCache))}\n`
          );
        }
      }
    })
  )
    .filter((movie): movie is Movie => movie !== null)
    .slice(0, requestedCount);

  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(movies, null, 2)}\n`),
    writeFile(
      posterCachePath,
      `${JSON.stringify(Object.fromEntries(posterCache))}\n`
    )
  ]);
  console.log(`Wrote ${movies.length} films to ${outputPath}`);
}

void main();
