const siteUrl = process.env.VERCEL_SITE_URL?.replace(/\/$/, "");
const concurrency = 12;

if (!siteUrl) {
  throw new Error(
    "VERCEL_SITE_URL is required, for example https://your-project.vercel.app"
  );
}

async function mapWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>
) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
}

async function main() {
  const catalogResponse = await fetch(`${siteUrl}/api/catalog`);
  if (!catalogResponse.ok) {
    throw new Error(`Catalog request failed: ${catalogResponse.status}`);
  }
  const movies = (await catalogResponse.json()) as { id: number }[];

  console.log(`Migrating ${movies.length} poster objects through Vercel…`);
  await mapWithConcurrency(movies, async (movie, index) => {
    const response = await fetch(`${siteUrl}/api/posters/${movie.id}`);
    if (!response.ok) {
      console.warn(`Skipped ${movie.id}: ${response.status}`);
    } else {
      await response.arrayBuffer();
    }
    if ((index + 1) % 100 === 0) {
      console.log(`Migrated ${index + 1}/${movies.length}`);
    }
  });
  console.log(`Finished requesting ${movies.length} poster objects.`);
}

void main();
