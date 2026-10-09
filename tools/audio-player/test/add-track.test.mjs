import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addDriveTrack, driveMediaUrl, parseArgs } from "../add-track.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const playerDir = path.resolve(here, "..");
const indexPath = path.join(playerDir, "index.html");
const SAMPLE_ID = "1jZusuknMRR2g0uk97_4-bHtRSDEVdHW-";

async function withRoot(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "audio-player-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("parseArgs reads a drive id and rejects extra files", () => {
  assert.deepEqual(parseArgs(["--drive-id", SAMPLE_ID, "--title", "甲", "--bytes", "12"]), {
    driveId: SAMPLE_ID,
    title: "甲",
    bytes: "12",
    root: null,
    help: false,
    source: null
  });
  assert.throws(() => parseArgs(["a.mp3", "b.mp3"]), /唔會複製聲音檔/);
});

test("driveMediaUrl is the Drive API media endpoint", () => {
  const url = new URL(driveMediaUrl(SAMPLE_ID));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "www.googleapis.com");
  assert.equal(url.pathname, "/drive/v3/files/" + SAMPLE_ID);
  assert.equal(url.searchParams.get("alt"), "media");
  assert.equal(url.searchParams.get("key"), null);
  assert.throws(() => driveMediaUrl("../etc"), /drive id/);
});

test("addDriveTrack writes a link and does not copy audio bytes", async () => {
  await withRoot(async (root) => {
    const first = await addDriveTrack({
      root,
      driveId: SAMPLE_ID,
      title: "PE02 Audio.mp3",
      bytes: 3506112
    });
    assert.equal(first.entry.title, "PE02 Audio");
    assert.equal(first.entry.file, undefined);
    assert.equal(first.entry.url, driveMediaUrl(SAMPLE_ID));
    const names = await readdir(root);
    assert.deepEqual(names, ["tracks.json"]);

    await addDriveTrack({
      root,
      driveId: "17FdYo_rEbSn2-6buu6J4iZvxTo3BNLiF",
      title: "第二段"
    });
    const doc = JSON.parse(await readFile(path.join(root, "tracks.json"), "utf8"));
    assert.equal(doc.version, 2);
    assert.equal(doc.folderId, "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0");
    assert.equal(doc.tracks[0].title, "第二段");
    assert.equal(doc.tracks[1].driveId, SAMPLE_ID);
    await assert.rejects(addDriveTrack({ root, driveId: SAMPLE_ID, title: "再來" }), /已經喺播放清單/);
  });
});

test("published playlist is drive links only", async () => {
  const doc = JSON.parse(await readFile(path.join(playerDir, "tracks.json"), "utf8"));
  assert.equal(doc.version, 2);
  assert.equal(doc.folderId, "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0");
  const titles = doc.tracks.map((track) => track.title);
  assert.deepEqual(titles, [
    "PE02_生命的基本單位",
    "PEE1-3_血液內氣體成份的調節",
    "PE02 Audio"
  ]);
  for (const track of doc.tracks) {
    assert.equal(track.url, driveMediaUrl(track.driveId));
    assert.equal(track.file, undefined);
    assert.ok(track.bytes > 0);
  }
  let mediaNames = [];
  try {
    mediaNames = await readdir(path.join(playerDir, "media"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  assert.deepEqual(mediaNames.filter((name) => name.endsWith(".mp3")), []);
});

test("player streams Drive links and keeps lock-screen controls", async () => {
  const html = await readFile(indexPath, "utf8");
  const cfg = await readFile(path.join(playerDir, "sync-config.js"), "utf8");
  assert.match(html, /fetch\("tracks\.json\?/);
  assert.match(html, /www\.googleapis\.com\/drive\/v3\/files/);
  assert.match(html, /driveApiKey/);
  assert.match(html, /mediaSession/);
  assert.match(html, /playbackRate/);
  assert.match(html, /playsinline/);
  assert.match(html, /id="sync-btn"/);
  assert.match(html, /同步尚未設定/);
  assert.match(html, /知道連結嘅人可以查看/);
  assert.match(cfg, /webhookUrl:\s*""/);
  assert.match(cfg, /driveApiKey:\s*""/);
  assert.match(cfg, /1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0/);
  assert.doesNotMatch(html + "\n" + cfg, /github_pat_|ghp_|gho_|ya29\./);
});

test("cli refuses to copy an mp3 into the repo", async () => {
  await withRoot(async (root) => {
    const source = path.join(root, "clip.mp3");
    await writeFile(source, Buffer.from("ID3"));
    const script = path.join(playerDir, "add-track.mjs");
    const { code, stderr } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [script, source, "--title", "唔好複製"], { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("close", (status) => resolve({ code: status, stderr: err }));
    });
    assert.notEqual(code, 0);
    assert.match(stderr, /唔會再將 mp3 複製入儲存庫/);
    const names = await readdir(root);
    assert.deepEqual(names, ["clip.mp3"]);
  });
});
