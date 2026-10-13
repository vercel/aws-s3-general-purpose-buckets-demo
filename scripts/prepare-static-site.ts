import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Movie } from "../lib/types";

const sourcePath = resolve("lib/demo-catalog.json");
const posterDirectory = resolve("public/posters");
const catalogDirectory = resolve("public/catalog");
const outputPath = resolve(catalogDirectory, "movies.json");

async function exists(path: string) {
  try {
    return (await stat(path)).size > 1024;
  } catch {
    return false;
  }
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

async function downloadPoster(movie: Movie, posterPath: string) {
  if (!movie.posterUrl) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(movie.posterUrl);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength <= 1024) return false;
        await writeFile(posterPath, bytes);
        return true;
      }
      if (response.status === 404) return false;
    } catch {
      // Retry transient network failures below.
    }
    if (attempt < 3) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 400 * 2 ** attempt)
      );
    }
  }
  return false;
}

async function main() {
  const movies = JSON.parse(await readFile(sourcePath, "utf8")) as Movie[];
  await Promise.all([
    mkdir(posterDirectory, { recursive: true }),
    mkdir(catalogDirectory, { recursive: true })
  ]);

  console.log(`Preparing ${movies.length} posters for static hosting…`);
  const preparedMovies = (
    await mapWithConcurrency(movies, 8, async (movie, index) => {
    const posterPath = resolve(posterDirectory, `${movie.id}.jpg`);
      const prepared =
        (await exists(posterPath)) || (await downloadPoster(movie, posterPath));
      if (!prepared) {
        console.warn(`Skipped ${movie.title}: poster unavailable`);
        return null;
      }
      if ((index + 1) % 100 === 0) {
        console.log(`Prepared ${index + 1}/${movies.length}`);
      }
      return movie;
    })
  ).filter((movie): movie is Movie => movie !== null);

  const staticCatalog = preparedMovies.map((movie) => ({
    ...movie,
    posterKey: `posters/${movie.id}.jpg`,
    posterUrl: `/posters/${movie.id}.jpg`
  }));
  await writeFile(outputPath, `${JSON.stringify(staticCatalog)}\n`);
  console.log(
    `Wrote ${staticCatalog.length} movies with posters to ${outputPath}`
  );
}

void main();
