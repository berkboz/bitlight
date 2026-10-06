#!/usr/bin/env node
// node film/mux.mjs --film <name|path.mjs> → out/<film>/<film>.mp4 (picture + score)
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadFilm, filmArg } from "./frame.mjs";

const film = await loadFilm(filmArg());
const dir = film.out, dest = path.join(dir, `${film.name}.mp4`);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(dir, "picture.mp4"), "-i", path.join(dir, "score.wav"),
  "-c:v", "copy", "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", dest], { stdio: "inherit" });
console.log(`→ ${path.relative(process.cwd(), dest)}`);
