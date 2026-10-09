#!/usr/bin/env node
/**
 * Copy an audio file into media/ and prepend it to tracks.json.
 * Does not commit, push, or read any credentials.
 *
 *   node tools/audio-player/add-track.mjs lesson.mp3 --title "標題"
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const PLAYER_DIR = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".flac", ".webm", ".opus"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PUBLIC_URL = "https://ksl-blip.github.io/biology-simulators/tools/audio-player/";

export function makeId(title, { now = Date.now(), taken = new Set() } = {}) {
  const slug = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = now.toString(36);
  let base = ((slug ? slug + "-" : "t-") + stamp).replace(/[^a-z0-9-]/g, "").slice(0, 60);
  if (!ID_RE.test(base)) base = "t-" + stamp;
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = (base + "-" + n).slice(0, 64);
    n += 1;
    if (n > 1000) throw new Error("id 太多相撞");
  }
  return id;
}

export function parseArgs(argv) {
  const out = { source: null, title: null, id: null, root: null, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title" || arg === "--id" || arg === "--root") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(arg + " 需要一個值");
      }
      i += 1;
      if (arg === "--title") out.title = value;
      else if (arg === "--id") out.id = value;
      else out.root = value;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error("未知選項：" + arg);
    } else {
      rest.push(arg);
    }
  }
  if (rest.length > 1) throw new Error("只接受一個聲音檔");
  out.source = rest[0] || null;
  return out;
}

function helpText() {
  return [
    "用法：node tools/audio-player/add-track.mjs <聲音檔> --title \"標題\" [--id 自訂id] [--root 目錄]",
    "",
    "將聲音檔複製到 media/，並加到 tracks.json 最前面。",
    "呢個指令唔會提交、唔會推送，亦唔會讀取任何金鑰。",
    "提交並推上 main 之後，公開網址先至聽得：" + PUBLIC_URL
  ].join("\n");
}

function cleanTitle(title, fallback) {
  const text = String(title || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.slice(0, 120);
}

async function readManifest(manifestPath) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return { version: 1, tracks: [] };
    throw err;
  }
  let data;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error("tracks.json 唔係有效 JSON：" + err.message);
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.tracks)) {
    throw new Error("tracks.json 必須有 tracks 陣列");
  }
  if (data.version == null) data.version = 1;
  return data;
}

async function readHead(file, n) {
  const handle = await open(file, "r");
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await handle.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function looksLikeMp3(buf) {
  if (buf.length >= 3 && buf.subarray(0, 3).toString("ascii") === "ID3") return true;
  const n = Math.min(buf.length - 1, 4096);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

async function probeSeconds(file) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file
    ], { timeout: 8000 });
    const n = Number(String(stdout).trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000) / 1000;
  } catch (err) {
    return null;
  }
  return null;
}

export async function addTrack({ root = PLAYER_DIR, sourcePath, title, id, now = Date.now() } = {}) {
  if (!sourcePath) throw new Error("請提供聲音檔路徑");
  const source = path.resolve(sourcePath);
  const info = await stat(source).catch((err) => {
    if (err && err.code === "ENOENT") throw new Error("搵唔到檔案：" + source);
    throw err;
  });
  if (!info.isFile()) throw new Error("唔係檔案：" + source);
  if (info.size <= 0) throw new Error("檔案係空嘅");
  if (info.size > 50 * 1024 * 1024) {
    throw new Error("檔案大於 50 MB。GitHub 會對大檔案發出警告，請先壓縮或剪短。");
  }

  const ext = path.extname(source).toLowerCase();
  if (!AUDIO_EXT.has(ext)) {
    throw new Error("只接受 " + [...AUDIO_EXT].join("、") + "，而家係 " + (ext || "冇副檔名"));
  }
  if (ext === ".mp3") {
    const head = await readHead(source, 16384);
    if (!looksLikeMp3(head)) throw new Error("呢個 mp3 睇落唔似有效聲音檔");
  }

  const playerRoot = path.resolve(root);
  const manifestPath = path.join(playerRoot, "tracks.json");
  const doc = await readManifest(manifestPath);
  const taken = new Set(doc.tracks.map((track) => track && track.id).filter(Boolean));
  let trackId = id == null || id === "" ? makeId(title || path.basename(source, ext), { now, taken }) : String(id).toLowerCase();
  if (!ID_RE.test(trackId)) {
    throw new Error("--id 只可以係小寫英文、數字同連字號，最長 64 字");
  }
  if (taken.has(trackId)) throw new Error("id 已經存在：" + trackId);

  const fileName = trackId + ext;
  const rel = "media/" + fileName;
  if (rel.includes("..") || !/^media\/[A-Za-z0-9._-]+$/.test(rel)) {
    throw new Error("檔名唔安全：" + rel);
  }
  const mediaDir = path.join(playerRoot, "media");
  const dest = path.join(mediaDir, fileName);
  if (!dest.startsWith(mediaDir + path.sep)) throw new Error("拒絕寫入 media 以外");

  await mkdir(mediaDir, { recursive: true });
  await copyFile(source, dest);

  const display = cleanTitle(title, cleanTitle(path.basename(source, ext), trackId));
  const entry = {
    id: trackId,
    title: display,
    file: rel,
    bytes: info.size
  };
  const duration = await probeSeconds(dest);
  if (duration != null) entry.duration = duration;
  doc.tracks.unshift(entry);
  delete doc.folderId;

  const tmp = manifestPath + ".tmp";
  await writeFile(tmp, JSON.stringify(doc, null, 2) + "\n");
  await rename(tmp, manifestPath);
  return { entry, manifestPath, dest, publicUrl: PUBLIC_URL };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.source) {
    console.log(helpText());
    process.exit(args.help ? 0 : 1);
  }
  const { entry, dest } = await addTrack({
    root: args.root || PLAYER_DIR,
    sourcePath: args.source,
    title: args.title,
    id: args.id
  });
  const relDest = path.relative(process.cwd(), dest) || dest;
  const relManifest = path.relative(process.cwd(), path.join(args.root || PLAYER_DIR, "tracks.json"));
  console.log("已加入「" + entry.title + "」");
  console.log("檔案：" + relDest);
  console.log("清單：" + relManifest);
  console.log("");
  console.log("下一步：提交呢兩個變更，再推上 main（或開 pull request 合併）。");
  console.log("呢個指令冇有任何金鑰，亦未幫你提交。");
  console.log("Pages 更新之後，任何人打開下面網址都聽得：");
  console.log(PUBLIC_URL);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
