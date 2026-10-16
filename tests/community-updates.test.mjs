import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const backend = fs.readFileSync("google-apps-script/Community.gs", "utf8");
const frontend = fs.readFileSync("src/lib/campaign-message.ts", "utf8");
const exported = {};
vm.runInNewContext(ts.transpileModule(frontend, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });

function chatContext() {
  const posted = [];
  const context = vm.createContext({
    clean: (value) => String(value || "").trim(),
    findInviteByToken: (token) => token === "valid" ? { invite: { householdId: "test" } } : null,
    SHEETS: { responses: "responses", guestProfiles: "profiles", chatMessages: "messages" },
    readSheet: (name) => name === "responses" ? [{ householdId: "test" }] : [],
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Utilities: { getUuid: () => String(posted.length) },
  });
  vm.runInContext(backend, context);
  context.getGuestProfile = () => ({ displayName: "Test Guest" });
  context.appendChatMessage = (record) => { posted.push(record); return record; };
  return { context, posted };
}

test("ordinary chat never triggers unsolicited bot replies", () => {
  const { context, posted } = chatContext();
  for (const body of ["hello", "Looking forward to music!", "The bot is quiet", "modbotany", "/me dances", "/shrug", "[[hat-vote:yes]]"]) {
    const reply = context.postMessage({ token: "valid", body });
    assert.equal(reply.ok, true);
    assert.equal(reply.botMessage, null);
  }
  assert.equal(posted.filter((message) => message.kind === "bot").length, 0);
});

test("jam messages and bot replies retain their separate channel", () => {
  const { context, posted } = chatContext();
  assert.equal(context.postMessage({ token: "valid", body: "I can bring a mic", channel: "jam" }).message.channel, "jam");
  assert.equal(context.postMessage({ token: "valid", body: "@modbot hello", channel: "jam" }).botMessage.channel, "jam");
  assert.equal(context.postMessage({ token: "valid", body: "hello" }).message.channel, "party");
  assert.throws(() => context.postMessage({ token: "valid", body: "hi", channel: "other" }), /Unknown chat channel/);
  assert.equal(posted.length, 4);
});

test("channel reads isolate old party messages, hidden posts, and jam notes", () => {
  const { context } = chatContext();
  const rows = [
    { id: "old", body: "Legacy party", visible: true },
    { id: "party", body: "Party", visible: true, channel: "party" },
    { id: "jam", body: "Bring bass", visible: true, channel: "jam" },
    { id: "hidden", body: "Hidden", visible: false, channel: "jam" },
    { id: "deleted", body: "Deleted", visible: true, deleted: true, channel: "jam" },
  ];
  context.SHEETS.announcements = "announcements";
  context.readSheet = (name) => name === "responses" ? [{ householdId: "test" }] : name === "messages" ? rows : [];
  context.loadActivePoll = () => null;
  assert.deepEqual(Array.from(context.loadCommunity("valid", "jam").community.messages, (entry) => entry.id), ["jam"]);
  assert.deepEqual(Array.from(context.loadCommunity("valid").community.messages, (entry) => entry.id), ["old", "party"]);
  assert.equal(context.loadCommunity("invalid", "jam").ok, false);
  context.readSheet = () => [];
  assert.equal(context.loadCommunity("valid", "jam").community.unlocked, false);
});

test("explicit bot mentions reply once; authentication and IRC commands still work", () => {
  const { context, posted } = chatContext();
  for (const body of ["@modbot hi", "Hello @Wedding Mod Bot!", "Wedding Mod Bot: hello", "@weddingmodbot", "MODBOT, dance"]) {
    assert.ok(context.postMessage({ token: "valid", body }).botMessage);
  }
  assert.equal(posted.filter((message) => message.kind === "bot").length, 5);
  const before = posted.length;
  assert.equal(context.postMessage({ token: "bad", body: "@modbot" }).ok, false);
  assert.ok(context.postMessage({ token: "valid", body: "/help" }).botMessage);
  assert.equal(context.postMessage({ token: "valid", body: "/rsvp" }).openRsvp, true);
  assert.equal(posted.length, before);
});

test("email, copy, and mobile share contain exactly one personal URL and first-name greeting", () => {
  const { context } = chatContext();
  const url = "https://example.test/#invite=private-token";
  const reminder = "Don't forget to check your invitation link frequently for updates.";
  for (const body of ["Hi {name}, join the music!", "Hi {name}, {invite}", "Hi {name}, {invite}\n{invite}", `Hi {name}, ${url}\n${url}`, `Hi {name}, {invite}\n${reminder}`]) {
    const text = exported.campaignMessage(body, "Jonathan Briskin", url);
    assert.equal(text.split(url).length - 1, 1);
    assert.equal(text.split(reminder).length - 1, 1);
    assert.ok(text.startsWith("Hi Jonathan,"));
    assert.equal(text, context.campaignMessageText(body, "Jonathan Briskin", url));
    const share = exported.campaignShareData("Music", text);
    assert.equal(share.text, text);
    assert.equal(share.url, undefined);
  }
});

test("Eric's confirmations narrow the artist choices and clear review state", () => {
  const songs = JSON.parse(fs.readFileSync("src/jam/songs.json", "utf8"));
  assert.equal(songs.filter((song) => song.needsReview).length, 0);
  const confirmed = songs.filter((song) => song.reviewNote === "Confirmed by Eric");
  assert.equal(confirmed.length, 18);
  assert.ok(confirmed.every((song) => song.options.length === 1 && song.options[0] === song.artist));
});
