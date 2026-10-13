"use client";

import { useState } from "react";
import type { Movie } from "@/lib/types";
import { StarIcon } from "./icons";

export function MovieCard({ movie }: { movie: Movie }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="movie-card">
      <div className="poster" style={{ backgroundColor: movie.accent }}>
        {!imageFailed && movie.posterUrl ? (
          // S3 results use temporary signed URLs, so a native image is intentional.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.posterUrl}
            alt={`${movie.title} poster`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="poster-fallback">{movie.title}</span>
        )}
      </div>
      <div className="movie-details">
        <h2 title={movie.title}>{movie.title}</h2>
        <p>
          <span>{movie.year}</span>
          <span aria-hidden="true">·</span>
          <span className="rating">
            <StarIcon />
            {movie.rating.toFixed(1)}
          </span>
        </p>
      </div>
    </article>
  );
}
