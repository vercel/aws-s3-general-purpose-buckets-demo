"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Movie } from "@/lib/types";
import { SearchIcon } from "./icons";
import { MovieCard } from "./movie-card";

const pageSize = 24;

function searchableText(movie: Movie) {
  return [
    movie.title,
    movie.year,
    movie.director,
    ...(movie.genres ?? []),
    ...(movie.cast ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function MovieExplorer() {
  const [catalog, setCatalog] = useState<Movie[]>([]);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("popular");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return response.json() as Promise<Movie[]>;
      })
      .then((movies) => {
        if (!cancelled) setCatalog(movies);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the movie catalog.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const matches = useMemo(() => {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered =
      terms.length === 0
        ? [...catalog]
        : catalog.filter((movie) => {
            const haystack = searchableText(movie);
            return terms.every((term) => haystack.includes(term));
          });

    return filtered.sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "newest") return b.year - a.year;
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.popularity - a.popularity;
    });
  }, [catalog, query, sort]);

  const visibleMovies = matches.slice(0, visibleCount);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
    setVisibleCount(pageSize);
  }

  function changeSort(value: string) {
    setSort(value);
    setVisibleCount(pageSize);
  }

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <h1>S3 Movie Poster Search</h1>
          <p>Next.js + Amazon S3 general purpose buckets</p>
        </div>
        <a
          href="https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata"
          target="_blank"
          rel="noreferrer"
        >
          Dataset
        </a>
      </header>

      <section className="about-panel">
        <p>
          This app uses Amazon S3 general purpose buckets with Next.js and
          Vercel.
        </p>
        <details>
          <summary>How does this work?</summary>
          <p>
            Movies are fetched from a JSON catalog in the private S3 bucket
            when the page loads. It has been seeded with 4,395 movies from the
            TMDB 5000 dataset. Search runs in the browser, and poster images are
            served from S3 through Vercel&apos;s CDN. The AWS Native Integration
            uses OIDC, so no AWS access keys are stored in this project.
          </p>
        </details>
        <div className="connection-status">
          <span className={catalog.length ? "connected" : ""} />
          {catalog.length
            ? `${catalog.length} movies loaded from the S3 catalog`
            : "Loading the S3 catalog"}
        </div>
      </section>

      <form className="movie-search" onSubmit={submitSearch}>
        <SearchIcon />
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search movies..."
          aria-label="Search movies"
        />
        <button type="submit">Search</button>
      </form>

      <div className="results-toolbar">
        <p>
          {loading
            ? "Loading movies..."
            : `${matches.length} movie${matches.length === 1 ? "" : "s"}`}
          {query ? ` matching “${query}”` : ""}
        </p>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => changeSort(event.target.value)}
            aria-label="Sort movies"
          >
            <option value="popular">Popularity</option>
            <option value="rating">Rating</option>
            <option value="newest">Newest</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="message error-message">
          {error}{" "}
          <button
            onClick={() => {
              setLoading(true);
              setError("");
              setRefreshToken((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!error && loading ? (
        <div className="movie-grid" aria-label="Loading movies">
          {Array.from({ length: 12 }, (_, index) => (
            <div className="movie-skeleton" key={index}>
              <span />
              <i />
            </div>
          ))}
        </div>
      ) : visibleMovies.length ? (
        <>
          <div className="movie-grid">
            {visibleMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
          {visibleCount < matches.length && (
            <div className="load-more">
              <button
                onClick={() => setVisibleCount((count) => count + pageSize)}
              >
                Load more ({matches.length - visibleMovies.length} remaining)
              </button>
            </div>
          )}
        </>
      ) : !loading && !error ? (
        <div className="message">No movies found.</div>
      ) : null}

      <footer>
        This product uses the TMDB API but is not endorsed or certified by
        TMDB.
      </footer>
    </main>
  );
}
