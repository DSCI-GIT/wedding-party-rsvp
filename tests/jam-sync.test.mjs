import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const exported = {};
const validation = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/jam/state.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: validation });
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/jam/sync.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported, require: () => validation, crypto: webcrypto, TextEncoder, Date, Set, JSON });
const { JamSync, optimisticState, installJamSync } = exported;
const initial = () => ({ viewer: { id: "guest:primary", name: "Alex", initials: "A", enabled: false }, members: [], songs: Array.from({ length: 94 }, (_, n) => ({ id: `S${n}`, title: `Song ${n}`, artist: "Test artist", options: ["Test artist"], needsReview: false, reviewNote: "", bandOrder: n, acousticOrder: null })), claims: [], ownClaims: [], choices: {}, votes: {}, myVotes: [] });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const values = new Map(), calls = [], exits = [];
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  let server = initial(), fail = false;
  const request = async (action, payload) => {
    calls.push({ action, payload });
    if (fail) throw Error("offline");
    if (action === "batch") server = structuredClone(optimisticState(server, payload.changes));
    return { ok: true, state: structuredClone(server), ackRevision: payload?.revision };
  };
  return { storage, calls, exits, values, request, setServer: (state) => { server = state; }, setFail: (value) => { fail = value; }, make: (token = "test-person") => new JamSync(token, storage, request, (payload) => { exits.push(payload); return true; }) };
}

test("30 fast likes are immediately local, survive reload, and do not make 30 requests", async () => {
  const f = fixture(), sync = f.make(); await sync.start();
  for (let n = 0; n < 30; n++) sync.change({ action: "vote", songId: `S${n}`, selected: true });
  assert.equal(sync.getSnapshot().state.myVotes.length, 30);
  assert.equal(f.calls.length, 1);
  assert.equal(f.make().getSnapshot().state.myVotes.length, 30);
  assert.equal(f.make("someone-else").getSnapshot().state, undefined);
  sync.change({ action: "vote", songId: "S0", selected: false });
  sync.change({ action: "vote", songId: "S0", selected: true });
  assert.equal(sync.getSnapshot().pending, 30);
  await sync.sync();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].payload.changes.length, 30);
  assert.equal(sync.getSnapshot().pending, 0);
});

test("server refresh preserves local choices and accurately overlays vote totals", async () => {
  const f = fixture(), sync = f.make(); await sync.start();
  sync.change({ action: "vote", songId: "S0", selected: true });
  f.setServer({ ...initial(), votes: { S0: 2 } });
  await sync.refresh();
  assert.equal(sync.getSnapshot().state.votes.S0, 3);
  await sync.sync();
  assert.equal(sync.getSnapshot().state.votes.S0, 3);
  assert.equal(sync.getSnapshot().pending, 0);
});

test("new clicks made during an in-flight save are not acknowledged away", async () => {
  const f = fixture(); let resolve;
  const sync = new JamSync("slow-person", f.storage, (action, payload) => action === "state" ? f.request(action, payload) : new Promise((done) => { resolve = done; }), () => true);
  await sync.start(); sync.change({ action: "vote", songId: "S0", selected: true });
  const saving = sync.sync();
  const stored = JSON.parse([...f.values.values()][0]);
  sync.change({ action: "vote", songId: "S0", selected: false });
  sync.change({ action: "vote", songId: "S1", selected: true });
  resolve({ ok: true, state: optimisticState(initial(), [{ action: "vote", songId: "S0", selected: true }]), ackRevision: stored.revision });
  await saving;
  assert.equal(sync.getSnapshot().pending, 2);
  assert.deepEqual([...sync.getSnapshot().state.myVotes], ["S1"]);
});

test("offline saves and exit beacons retain the queue until confirmed, including after restart", async () => {
  const f = fixture(), sync = f.make(); await sync.start();
  sync.change({ action: "vote", songId: "S3", selected: true }); f.setFail(true);
  await sync.sync(); assert.equal(sync.getSnapshot().pending, 1);
  sync.flushOnExit(); sync.flushOnExit(); assert.equal(f.exits.length, 1);
  assert.equal(f.make().getSnapshot().pending, 1);
  const restored = f.make(); f.setFail(false); await restored.start();
  assert.equal(restored.getSnapshot().pending, 0);
  assert.ok(restored.getSnapshot().state.myVotes.includes("S3"));
});

test("musician switch, instrument ordering, and dormant own selections remain local", async () => {
  const f = fixture(), sync = f.make(); await sync.start();
  sync.change({ action: "participation", enabled: true });
  sync.change({ action: "setClaim", songId: "S0", role: "guitar", selected: true });
  sync.change({ action: "participation", enabled: false });
  assert.equal(sync.getSnapshot().state.claims.length, 0);
  sync.change({ action: "participation", enabled: true });
  assert.equal(sync.getSnapshot().state.claims.length, 1);
  await sync.sync();
  assert.deepEqual([...f.calls[1].payload.changes.map((c) => c.action)], ["participation", "setClaim", "participation", "participation"]);
});

test("sync timer is five minutes and exit/visibility/online handlers are cleaned up", async () => {
  const f = fixture(), sync = f.make(), timers = new Map();
  const browser = new EventTarget(); let id = 0;
  browser.setInterval = (callback, duration) => { timers.set(++id, { callback, duration }); return id; };
  browser.clearInterval = (key) => timers.delete(key);
  const page = new EventTarget(); page.hidden = false; page.activeElement = null;
  const stop = installJamSync(sync, browser, page); await tick();
  sync.change({ action: "vote", songId: "S0", selected: true });
  const refresh = [...timers.values()].find((timer) => timer.duration === 60000);
  for (let n = 0; n < 4; n++) { refresh.callback(); await tick(); }
  assert.equal(f.calls.filter((call) => call.action === "batch").length, 0);
  [...timers.values()].find((timer) => timer.duration === 300000).callback(); await tick();
  assert.equal(f.calls.filter((call) => call.action === "batch").length, 1);
  sync.change({ action: "vote", songId: "S1", selected: true });
  page.hidden = true; page.dispatchEvent(new Event("visibilitychange"));
  browser.dispatchEvent(new Event("pagehide"));
  assert.equal(f.exits.length, 1);
  browser.dispatchEvent(new Event("online")); await tick(); assert.equal(sync.getSnapshot().pending, 0);
  stop(); assert.equal(timers.size, 0);
});

test("storage failures are reported and trigger immediate best-effort shared saving", async () => {
  const f = fixture();
  const sync = new JamSync("restricted", { getItem: () => null, setItem: () => { throw Error("quota"); } }, f.request, () => false);
  await sync.start(); sync.change({ action: "vote", songId: "S0", selected: true }); await tick();
  assert.ok(sync.getSnapshot().localError.includes("storage"));
  assert.equal(sync.getSnapshot().pending, 0);
});

test("incomplete successful refresh never clears an already-loaded board or its pending choices", async () => {
  const f = fixture(); let malformed = false;
  const sync = new JamSync("incomplete-refresh", f.storage, (action, payload) => malformed ? Promise.resolve({ ok: true, service: "wedding-jam", version: 2 }) : f.request(action, payload), () => true);
  await sync.start(); sync.change({ action: "vote", songId: "S0", selected: true });
  malformed = true; await sync.refresh();
  assert.equal(sync.getSnapshot().state.songs.length, 94);
  assert.equal(sync.getSnapshot().state.myVotes.length, 1);
  assert.equal(sync.getSnapshot().pending, 1);
  assert.equal(sync.getSnapshot().loading, false);
  assert.ok(sync.getSnapshot().error.includes("incomplete"));
  assert.ok(JSON.parse([...f.values.values()][0]).state.viewer);
});

test("five-minute save with a missing/invalid state preserves the board and unacknowledged queue", async () => {
  for (const badState of [undefined, {}, { ...initial(), songs: [{ id: "bad" }] }, { ...initial(), claims: null }]) {
    const f = fixture();
    const sync = new JamSync("incomplete-save", f.storage, (action, payload) => action === "batch" ? Promise.resolve({ ok: true, ackRevision: payload.revision, state: badState }) : f.request(action, payload), () => true);
    await sync.start(); sync.change({ action: "vote", songId: "S1", selected: true });
    await sync.sync();
    assert.equal(sync.getSnapshot().state.songs.length, 94);
    assert.equal(sync.getSnapshot().pending, 1);
    assert.equal(sync.getSnapshot().syncing, false);
    assert.equal(sync.getSnapshot().loading, false);
    assert.ok(sync.getSnapshot().state.myVotes.includes("S1"));
  }
});

test("recover pending choices left in a cache without board data by the previous bug", async () => {
  const f = fixture(), sync = f.make(); await sync.start();
  sync.change({ action: "vote", songId: "S2", selected: true });
  const [key, raw] = [...f.values.entries()][0];
  const damaged = JSON.parse(raw); delete damaged.state;
  f.values.set(key, JSON.stringify(damaged));
  const recovered = f.make();
  assert.equal(recovered.getSnapshot().pending, 1);
  await recovered.start();
  assert.equal(recovered.getSnapshot().state.songs.length, 94);
  assert.ok(recovered.getSnapshot().state.myVotes.includes("S2"));
  assert.equal(recovered.getSnapshot().pending, 0);
});
