#!/usr/bin/env node
/**
 * Prepend a Google Drive stream link to tracks.json.
 * Does not download or copy MP3 bytes, and does not commit or read secrets.
 *
 *   node tools/audio-player/add-track.mjs --drive-id FILE_ID --title "標題"
 */
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLAYER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,80}$/;
export const FOLDER_ID = "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0";
const PUBLIC_URL = "https://ksl-blip.github.io/biology-simulators/tools/audio-player/";

export function driveMediaUrl(driveId) {
  if (!DRIVE_ID_RE.test(driveId)) throw new Error("drive id 唔正確");
  const url = new URL("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(driveId));
  url.searchParams.set("alt", "media");
  return url.href;
}

export function parseArgs(argv) {
  const out = { driveId: null, title: null, bytes: null, root: null, help: false, source: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--drive-id" || arg === "--title" || arg === "--bytes" || arg === "--root") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(arg + " 需要一個值");
      i += 1;
      if (arg === "--drive-id") out.driveId = value;
      else if (arg === "--title") out.title = value;
      else if (arg === "--bytes") out.bytes = value;
      else out.root = value;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error("未知選項：" + arg);
    } else {
      rest.push(arg);
    }
  }
  if (rest.length > 1) throw new Error("只接受一個路徑，而且唔會複製聲音檔");
  out.source = rest[0] || null;
  return out;
}

function helpText() {
  return [
    "用法：node tools/audio-player/add-track.mjs --drive-id FILE_ID --title \"標題\" [--bytes 位元組]",
    "",
    "只係將 Google Drive 串流連結加到 tracks.json，唔會下載或複製 mp3。",
    "檔案本身要設成「知道連結嘅人可以查看」，播放器先播到。",
    "呢個指令唔會提交，亦唔會讀取任何金鑰。",
    "公開網址：" + PUBLIC_URL
  ].join("\n");
}

function cleanTitle(title, driveId) {
  const text = String(title || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\.mp3$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return (text || driveId).slice(0, 120);
}

async function readManifest(manifestPath) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return { version: 2, folderId: FOLDER_ID, tracks: [] };
    }
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
  data.version = 2;
  if (!data.folderId) data.folderId = FOLDER_ID;
  return data;
}

export async function addDriveTrack({ root = PLAYER_DIR, driveId, title, bytes } = {}) {
  if (!driveId) throw new Error("請提供 --drive-id");
  if (!DRIVE_ID_RE.test(driveId)) throw new Error("drive id 唔正確");
  const manifestPath = path.join(path.resolve(root), "tracks.json");
  const doc = await readManifest(manifestPath);
  if (doc.tracks.some((track) => track && (track.driveId === driveId || track.id === driveId))) {
    throw new Error("呢個 Drive 檔案已經喺播放清單：" + driveId);
  }
  let size = null;
  if (bytes != null && bytes !== "") {
    size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) throw new Error("--bytes 要係數字");
  }
  const entry = {
    id: driveId,
    title: cleanTitle(title, driveId),
    driveId: driveId,
    url: driveMediaUrl(driveId)
  };
  if (size != null) entry.bytes = size;
  doc.tracks.unshift(entry);
  const tmp = manifestPath + ".tmp";
  await writeFile(tmp, JSON.stringify(doc, null, 2) + "\n");
  await rename(tmp, manifestPath);
  return { entry, manifestPath, publicUrl: PUBLIC_URL };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.driveId && !args.source)) {
    console.log(helpText());
    process.exit(args.help ? 0 : 1);
  }
  if (args.source && !args.driveId) {
    throw new Error("唔會再將 mp3 複製入儲存庫。請用 --drive-id，聲音檔留喺 Google Drive。");
  }
  const { entry } = await addDriveTrack({
    root: args.root || PLAYER_DIR,
    driveId: args.driveId,
    title: args.title,
    bytes: args.bytes
  });
  console.log("已加入「" + entry.title + "」");
  console.log("串流：" + entry.url);
  console.log("");
  console.log("下一步：只提交 tracks.json，推上 main。唔好提交 mp3。");
  console.log("呢個指令未幫你提交。檔案要設成知道連結嘅人可以查看。");
  console.log(PUBLIC_URL);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}
