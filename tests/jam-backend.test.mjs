import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../google-apps-script/jam/Code.gs", import.meta.url), "utf8");
const songs = JSON.parse(readFileSync(new URL("../src/jam/songs.json", import.meta.url), "utf8"));
const tokens = { simon: "test-simon-invite-0123456789", guest: "test-guest-invite-0123456789", partner: "test-partner-invite-0123456789" };

export function makeBackend() {
  const data = { Invitees: [["householdId", "primaryName", "partnerName", "inviteToken", "primaryInviteToken", "partnerInviteToken"], ["simon-carroll", "Simon Carroll", "", tokens.simon, tokens.simon, ""], ["guests", "Alex Sample", "Jamie Sample", tokens.guest, tokens.guest, tokens.partner]] };
  const getSheet = (name) => data[name] ? {
    getDataRange: () => ({ getValues: () => structuredClone(data[name]) }),
    getRange: (r, c, height, width) => ({
      getValues: () => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => data[name][r + y - 1]?.[c + x - 1] ?? "")),
      setValues: (rows) => rows.forEach((row, y) => row.forEach((value, x) => { data[name][r + y - 1] ||= []; data[name][r + y - 1][c + x - 1] = value; })),
      clearContent: () => { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[name][r + y - 1][c + x - 1] = ""; },
    }),
    getLastRow: () => data[name].length,
    appendRow: (row) => data[name].push([...row]),
    deleteRow: (row) => data[name].splice(row - 1, 1),
    setFrozenRows: () => {},
  } : null;
  const db = { getSheetByName: getSheet, insertSheet: (name) => { data[name] = []; return getSheet(name); } };
  let locked = false;
  const properties = new Map([["JAM_SPREADSHEET_ID", "test-spreadsheet"]]);
  const context = vm.createContext({
    JAM_DATABASE_ID: "test-spreadsheet", JAM_SONG_SEED: songs,
    console: { error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || null, setProperty: (key, value) => properties.set(key, value) }) },
    SpreadsheetApp: { openById: () => db, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, waitLock: () => { locked = true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }) },
  });
  vm.runInContext(source, context);
  context.setupJamBoard();
  return { data, context, call: (who, action, values = {}) => context.doPost({ postData: { contents: JSON.stringify({ token: tokens[who] || who, action, ...values }) } }) };
}

test("source lists preserve canonical overlap and source counts", () => {
  assert.equal(songs.length, 94);
  assert.equal(songs.filter((song) => song.bandOrder !== null).length, 51);
  assert.equal(songs.filter((song) => song.acousticOrder !== null).length, 53);
  assert.equal(songs.filter((song) => song.bandOrder !== null && song.acousticOrder !== null).length, 10);
  assert.equal(new Set(songs.map((song) => song.id)).size, songs.length);
});

test("invite authentication permits browsing while musician defaults remain server controlled", () => {
  const { call } = makeBackend();
  assert.equal(call("invalid", "state").ok, false);
  assert.equal(call("guest", "state").state.viewer.enabled, false);
  assert.equal(call("simon", "state").state.viewer.enabled, true);
  const state = call("guest", "state").state;
  assert.equal(JSON.stringify(state).includes(tokens.simon), false);
  assert.equal(JSON.stringify(state).includes("email"), false);
  assert.equal(call("guest", "setClaim", { songId: "S001", role: "guitar", selected: true }).ok, false);
});

test("all guests can cast idempotent votes and remove only their own", () => {
  const { call, data } = makeBackend();
  call("guest", "vote", { songId: "S001", selected: true, memberId: "simon-carroll:primary" });
  call("guest", "vote", { songId: "S001", selected: true });
  assert.equal(data.JamVotes.length, 2);
  assert.equal(data.JamVotes[1][1], "guests:primary");
  assert.equal(call("partner", "vote", { songId: "S001", selected: true }).state.votes.S001, 2);
  assert.equal(call("guest", "vote", { songId: "S001", selected: false }).state.votes.S001, 1);
  assert.equal(call("guest", "vote", { songId: "S001", selected: false }).state.votes.S001, 1);
  assert.equal(call("guest", "vote", { songId: "wrong", selected: true }).ok, false);
});

test("musicians can choose several parts without changing another person's claims", () => {
  const { call, data } = makeBackend();
  call("guest", "participation", { enabled: true });
  call("guest", "setClaim", { songId: "S001", role: "guitar", selected: true });
  call("guest", "setClaim", { songId: "S001", role: "vocals", selected: true });
  call("guest", "setClaim", { songId: "S001", role: "guitar", selected: true });
  call("simon", "setClaim", { songId: "S001", role: "guitar", selected: true });
  assert.equal(data.JamClaims.length, 4);
  const sharedGuitar = call("simon", "state").state.claims.filter((part) => part.songId === "S001" && part.role === "guitar");
  assert.deepEqual(Array.from(sharedGuitar, (part) => part.memberId).sort(), ["guests:primary", "simon-carroll:primary"]);
  call("guest", "setClaim", { songId: "S001", role: "guitar", selected: false });
  assert.equal(call("simon", "state").state.claims.some((part) => part.songId === "S001" && part.role === "guitar" && part.memberId === "simon-carroll:primary"), true);
  assert.equal(call("simon", "state").state.claims.length, 2);
  call("guest", "participation", { enabled: false });
  assert.equal(call("simon", "state").state.claims.length, 1);
  call("guest", "participation", { enabled: true });
  assert.equal(call("simon", "state").state.claims.length, 2);
  assert.equal(call("guest", "setClaim", { songId: "S001", role: "invented", selected: true }).ok, false);
});

test("shared artist choices reject stale writes and non-listed values", () => {
  const { call } = makeBackend();
  assert.equal(call("simon", "artist", { songId: "S018", artist: "Robbie Williams", expectedRevision: 0 }).ok, false);
  assert.equal(call("simon", "artist", { songId: "S018", artist: "Pearl Jam", expectedRevision: 0 }).ok, true);
  assert.equal(call("simon", "artist", { songId: "S018", artist: "Pearl Jam", expectedRevision: 0 }).ok, false);
  assert.equal(call("simon", "state").state.choices.S018.artist, "Pearl Jam");
  assert.equal(call("simon", "artist", { songId: "S018", artist: "=BAD()", expectedRevision: 1 }).ok, false);
});

test("setup is repeatable and preserves existing votes and RSVP data", () => {
  const { call, context, data } = makeBackend();
  call("guest", "vote", { songId: "S001", selected: true });
  const before = JSON.stringify(data.Invitees);
  context.setupJamBoard();
  assert.equal(data.JamSongs.length, 95);
  assert.equal(data.JamVotes.length, 2);
  assert.equal(JSON.stringify(data.Invitees), before);
});

test("batch saves many selections once, preserving other guests and replaying safely", () => {
  const { call } = makeBackend();
  call("partner", "vote", { songId: "S001", selected: true });
  const payload = { clientId: "test-browser-client-00001", revision: 30, changes: songs.slice(0, 30).map((song) => ({ action: "vote", songId: song.id, selected: true })) };
  assert.equal(call("guest", "batch", payload).ackRevision, 30);
  const repeated = call("guest", "batch", payload);
  assert.equal(repeated.state.myVotes.length, 30);
  assert.equal(repeated.state.votes.S001, 2);
  assert.equal(call("guest", "batch", { ...payload, revision: 31, changes: [{ action: "vote", songId: "S001", selected: false }] }).state.votes.S001, 1);
  assert.equal(call("guest", "batch", payload).state.votes.S001, 1);
  assert.equal(call("unknown", "batch", payload).ok, false);
});

test("batch validation precedes writes and musician membership ordering is respected", () => {
  const { call } = makeBackend();
  const batch = { clientId: "test-browser-client-00002", revision: 1, changes: [{ action: "vote", songId: "S001", selected: true }, { action: "setClaim", songId: "S001", role: "guitar", selected: true }] };
  assert.equal(call("guest", "batch", batch).ok, false);
  assert.equal(call("guest", "state").state.myVotes.length, 0);
  const accepted = call("guest", "batch", { ...batch, changes: [{ action: "participation", enabled: true }, ...batch.changes, { action: "participation", enabled: false }] });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.claims.length, 0);
  assert.equal(accepted.state.ownClaims.length, 1);
  const enabled = call("guest", "participation", { enabled: true });
  assert.equal(enabled.state.claims.length, 1);
  assert.equal(call("guest", "batch", { ...batch, revision: 2, changes: [{ action: "setClaim", songId: "S001", role: "guitar", selected: false }, { action: "vote", songId: "S001", selected: false }] }).ok, true);
  const empty = call("guest", "state").state;
  assert.equal(empty.myVotes.length, 0); assert.equal(empty.claims.length, 0);
});
