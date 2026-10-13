import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse, type Options } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";

type OriginalMovie = {
  id: string;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
};

type CreditsRow = {
  movie_id: string;
  crew: string;
};

type CrewMember = {
  name: string;
  job?: string;
};

type EnrichedMovie = {
  title: string;
  director: string;
  overview: string;
  poster_path: string;
  year_norm: string;
};

type Candidate = {
  id: number;
  title: string;
  originalTitle: string;
  director: string;
  overview: string;
  year: string;
};

const moviesPath = resolve("data/tmdb_5000_movies.csv");
const creditsPath = resolve("data/tmdb_5000_credits.csv");
const enrichedPath = resolve("data/TMDB 230000 Movies Dataset.csv");
const cachePath = resolve("data/poster-url-cache.json");

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const [moviesCsv, creditsCsv, cachedJson] = await Promise.all([
    readFile(moviesPath, "utf8"),
    readFile(creditsPath, "utf8"),
    readFile(cachePath, "utf8")
  ]);
  const cache = JSON.parse(cachedJson) as Record<string, string | null>;
  const movies = parseSync(moviesCsv, {
    columns: true,
    skip_empty_lines: true
  }) as OriginalMovie[];
  const credits = parseSync(creditsCsv, {
    columns: true,
    skip_empty_lines: true
  }) as CreditsRow[];
  const directorById = new Map(
    credits.map((row) => [
      row.movie_id,
      parseJson<CrewMember[]>(row.crew, []).find(
        (member) => member.job === "Director"
      )?.name ?? ""
    ])
  );
  const remaining = movies
    .filter((movie) => !(movie.id in cache))
    .map(
      (movie): Candidate => ({
        id: Number(movie.id),
        title: movie.title,
        originalTitle: movie.original_title,
        director: directorById.get(movie.id) ?? "",
        overview: movie.overview,
        year: movie.release_date.slice(0, 4)
      })
    );
  const neededTitles = new Set(
    remaining.flatMap((movie) => [
      normalize(movie.title),
      normalize(movie.originalTitle)
    ])
  );
  const enrichedByTitle = new Map<string, EnrichedMovie[]>();
  const parserOptions: Options = {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  };
  let scanned = 0;

  for await (const row of createReadStream(enrichedPath).pipe(
    parse(parserOptions)
  ) as AsyncIterable<EnrichedMovie>) {
    scanned += 1;
    const titleKey = normalize(row.title);
    if (!row.poster_path?.startsWith("/") || !neededTitles.has(titleKey)) {
      continue;
    }
    const existing = enrichedByTitle.get(titleKey) ?? [];
    existing.push(row);
    enrichedByTitle.set(titleKey, existing);
  }

  let recovered = 0;
  let ambiguous = 0;
  for (const movie of remaining) {
    const matches = [
      ...(enrichedByTitle.get(normalize(movie.title)) ?? []),
      ...(enrichedByTitle.get(normalize(movie.originalTitle)) ?? [])
    ].filter(
      (match, index, all) =>
        all.findIndex(
          (candidate) => candidate.poster_path === match.poster_path
        ) === index
    );
    let selected: EnrichedMovie | undefined;
    const directorMatches = movie.director
      ? matches.filter(
          (match) => normalize(match.director) === normalize(movie.director)
        )
      : [];
    const overviewMatches = matches.filter(
      (match) =>
        normalize(match.overview) &&
        normalize(match.overview) === normalize(movie.overview)
    );
    const yearMatches = movie.year
      ? matches.filter((match) => match.year_norm === movie.year)
      : [];

    if (directorMatches.length === 1) {
      [selected] = directorMatches;
    } else if (overviewMatches.length === 1) {
      [selected] = overviewMatches;
    } else if (yearMatches.length === 1) {
      [selected] = yearMatches;
    } else if (matches.length === 1) {
      [selected] = matches;
    }

    if (selected) {
      cache[String(movie.id)] =
        `https://media.themoviedb.org/t/p/w500${selected.poster_path}`;
      recovered += 1;
    } else {
      ambiguous += 1;
    }
  }

  await writeFile(cachePath, `${JSON.stringify(cache)}\n`);
  console.log(
    JSON.stringify(
      {
        enrichedRowsScanned: scanned,
        remainingBefore: remaining.length,
        recovered,
        ambiguousOrMissing: ambiguous,
        cachedAfter: Object.keys(cache).length
      },
      null,
      2
    )
  );
}

void main();
