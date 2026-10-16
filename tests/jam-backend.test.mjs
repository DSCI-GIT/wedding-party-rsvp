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
    }),
    getLastRow: () => data[name].length,
    appendRow: (row) => data[name].push([...row]),
    deleteRow: (row) => data[name].splice(row - 1, 1),
    setFrozenRows: () => {},
  } : null;
  const db = { getSheetByName: getSheet, insertSheet: (name) => { data[name] = []; return getSheet(name); } };
  let locked = false;
  const context = vm.createContext({
    JAM_DATABASE_ID: "test-spreadsheet", JAM_SONG_SEED: songs,
    console: { error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "test-spreadsheet" }) },
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
  call("guest", "setClaim", { songId: "S001", role: "guitar", selected: false });
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
