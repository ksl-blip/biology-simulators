import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { addTrack, makeId, parseArgs } from "../add-track.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const playerDir = path.resolve(here, "..");
const indexPath = path.join(playerDir, "index.html");

function mp3Bytes() {
  return Buffer.concat([
    Buffer.from("ID3"),
    Buffer.alloc(7),
    Buffer.from([0xff, 0xfb, 0x90, 0x64])
  ]);
}

async function withRoot(fn) {
  const root = await mkdtemp(path.join(tmpdir(), "audio-player-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("makeId uses a stable slug and avoids collisions", () => {
  const taken = new Set(["lesson-1-10"]);
  assert.equal(makeId("Lesson 1", { now: 36, taken }), "lesson-1-10-2");
  assert.equal(makeId("連線測試", { now: 36, taken: new Set() }), "t-10");
  assert.equal(makeId("Osmosis / fries", { now: 36 }), "osmosis-fries-10");
});

test("parseArgs reads title, id, and a single file", () => {
  assert.deepEqual(parseArgs(["a.mp3", "--title", "甲", "--id", "jia"]), {
    source: "a.mp3",
    title: "甲",
    id: "jia",
    root: null,
    help: false
  });
  assert.throws(() => parseArgs(["a.mp3", "b.mp3"]), /只接受一個聲音檔/);
});

test("addTrack copies an mp3 into media and prepends tracks.json", async () => {
  await withRoot(async (root) => {
    const source = path.join(root, "src.mp3");
    await writeFile(source, mp3Bytes());
    const first = await addTrack({
      root,
      sourcePath: source,
      title: "第一段",
      id: "first",
      now: 1
    });
    assert.equal(first.entry.file, "media/first.mp3");
    assert.equal(first.entry.title, "第一段");
    assert.equal(first.entry.bytes, mp3Bytes().length);
    const saved = await readFile(first.dest);
    assert.equal(Buffer.compare(saved, mp3Bytes()), 0);

    await writeFile(path.join(root, "second.mp3"), mp3Bytes());
    const second = await addTrack({
      root,
      sourcePath: path.join(root, "second.mp3"),
      title: "第二段",
      now: 2
    });
    const doc = JSON.parse(await readFile(path.join(root, "tracks.json"), "utf8"));
    assert.equal(doc.version, 1);
    assert.equal(doc.tracks[0].title, "第二段");
    assert.equal(doc.tracks[1].id, "first");
    assert.equal(second.entry.file.startsWith("media/"), true);
    assert.doesNotMatch(second.entry.file, /\.\./);
    assert.equal(doc.tracks[0].url, undefined);
  });
});

test("addTrack rejects a fake mp3, unsafe ids, and duplicate ids", async () => {
  await withRoot(async (root) => {
    const fake = path.join(root, "notes.mp3");
    await writeFile(fake, Buffer.from("not audio"));
    await assert.rejects(addTrack({ root, sourcePath: fake, title: "唔係" }), /有效聲音檔/);
    await writeFile(fake, mp3Bytes());
    await assert.rejects(addTrack({ root, sourcePath: fake, id: "../escape" }), /--id/);
    await addTrack({ root, sourcePath: fake, id: "once", title: "一次" });
    await assert.rejects(addTrack({ root, sourcePath: fake, id: "once", title: "再來" }), /已經存在/);
  });
});

test("published playlist is the three classroom files in media/", async () => {
  const doc = JSON.parse(await readFile(path.join(playerDir, "tracks.json"), "utf8"));
  assert.equal(doc.version, 1);
  assert.equal(doc.folderId, undefined);
  const titles = doc.tracks.map((track) => track.title);
  assert.deepEqual(titles, [
    "PE02_生命的基本單位",
    "PEE1-3_血液內氣體成份的調節",
    "PE02 Audio"
  ]);
  for (const track of doc.tracks) {
    assert.match(track.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.match(track.file, /^media\/[A-Za-z0-9._-]+$/);
    assert.equal(track.file.includes(".."), false);
    assert.equal(track.url, undefined);
    assert.equal(track.driveId, undefined);
    const info = await stat(path.join(playerDir, track.file));
    assert.equal(info.isFile(), true);
    assert.equal(info.size, track.bytes);
    assert.ok(info.size > 0);
  }
  const banned = ["示範錄音 1", "示範錄音 2", "連線測試"];
  for (const title of banned) assert.equal(titles.includes(title), false);
});

test("player page plays hosted files and does not need a Drive API key", async () => {
  const html = await readFile(indexPath, "utf8");
  const cfg = await readFile(path.join(playerDir, "sync-config.js"), "utf8");
  assert.match(html, /fetch\("tracks\.json\?/);
  assert.match(html, /isSafeFile/);
  assert.match(html, /mediaSession/);
  assert.match(html, /playbackRate/);
  assert.match(html, /playsinline/);
  assert.match(html, /id="sync-btn"/);
  assert.match(html, /同步尚未設定/);
  assert.match(html, /node tools\/audio-player\/add-track\.mjs/);
  assert.match(cfg, /webhookUrl:\s*""/);
  assert.match(cfg, /1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0/);
  assert.doesNotMatch(html + "\n" + cfg, /driveApiKey|googleapis\.com|github_pat_|ghp_|gho_|ya29\./);
});

test("cli copies an mp3 and does not claim it committed", async () => {
  await withRoot(async (root) => {
    const source = path.join(root, "clip.mp3");
    await writeFile(source, mp3Bytes());
    const script = path.join(playerDir, "add-track.mjs");
    const { code, stdout, stderr } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        script,
        source,
        "--title", "命令列",
        "--id", "cli-clip",
        "--root", root
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("close", (status) => resolve({ code: status, stdout: out, stderr: err }));
    });
    assert.equal(stderr, "");
    assert.equal(code, 0);
    assert.match(stdout, /https:\/\/ksl-blip\.github\.io\/biology-simulators\/tools\/audio-player\//);
    assert.match(stdout, /未幫你提交/);
    const doc = JSON.parse(await readFile(path.join(root, "tracks.json"), "utf8"));
    assert.equal(doc.tracks[0].id, "cli-clip");
    assert.equal(doc.tracks[0].file, "media/cli-clip.mp3");
    const saved = await stat(path.join(root, "media", "cli-clip.mp3"));
    assert.equal(saved.size, mp3Bytes().length);
  });
});
