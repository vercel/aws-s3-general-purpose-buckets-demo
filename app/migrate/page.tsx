"use client";

import { useState } from "react";

type Status = "idle" | "running" | "done" | "error";

export default function MigratePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState("");

  async function migrate() {
    setStatus("running");
    setCompleted(0);
    setFailed(0);
    setMessage("Loading the movie catalog…");

    try {
      const catalogResponse = await fetch("/api/catalog");
      if (!catalogResponse.ok) {
        throw new Error(`Catalog request failed: ${catalogResponse.status}`);
      }
      const movies = (await catalogResponse.json()) as { id: number }[];
      setTotal(movies.length);
      setMessage("Copying posters into the attached S3 bucket…");

      let next = 0;
      let failures = 0;
      async function worker() {
        while (next < movies.length) {
          const movie = movies[next++];
          const response = await fetch(`/api/posters/${movie.id}`);
          if (!response.ok) failures += 1;
          else await response.arrayBuffer();
          setCompleted((value) => value + 1);
          setFailed(failures);
        }
      }

      await Promise.all(Array.from({ length: 8 }, worker));
      setStatus("done");
      setMessage(
        failures
          ? `Migration finished with ${failures} unavailable posters.`
          : "Migration finished successfully."
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Migration failed.");
    }
  }

  return (
    <main
      style={{
        fontFamily: "Arial, sans-serif",
        margin: "64px auto",
        maxWidth: 640,
        padding: "0 24px"
      }}
    >
      <h1>Populate the S3 movie bucket</h1>
      <p>
        This utility copies the catalog and poster objects from the existing
        deployment into the S3 bucket attached to Vercel.
      </p>
      <button
        disabled={status === "running"}
        onClick={migrate}
        style={{ fontSize: 16, padding: "10px 16px" }}
      >
        {status === "running" ? "Migration running…" : "Start migration"}
      </button>
      {status !== "idle" && (
        <div style={{ marginTop: 24 }}>
          <p>{message}</p>
          {total > 0 && (
            <>
              <progress value={completed} max={total} style={{ width: "100%" }} />
              <p>
                {completed} / {total} processed
                {failed ? ` · ${failed} failed` : ""}
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
