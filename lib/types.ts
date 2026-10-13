export type Movie = {
  id: number;
  title: string;
  year: number;
  genres: string[];
  overview: string;
  rating: number;
  voteCount: number;
  popularity: number;
  runtime: number;
  director?: string;
  cast?: string[];
  posterKey?: string;
  posterUrl?: string;
  accent: string;
};

export type SearchResponse = {
  movies: Movie[];
  total: number;
  page: number;
  pages: number;
  mode: "sample" | "s3";
  bucket?: string;
};
