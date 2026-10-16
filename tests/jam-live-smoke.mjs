import assert from "node:assert/strict";

const endpoint = process.env.JAM_TEST_URL;
const token = process.env.JAM_TEST_TOKEN;
const observerToken = process.env.JAM_TEST_OBSERVER_TOKEN;
if (!endpoint || !token || !observerToken) throw new Error("Provide the music endpoint and two authorized test invites through environment variables.");
async function request(who, action, values = {}) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: who, action, ...values }), signal: AbortSignal.timeout(55000) });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Music request failed");
  return data.state;
}
const rejected = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: "invalid-invitation-test", action: "state" }), signal: AbortSignal.timeout(55000) }).then((response) => response.json());
assert.equal(rejected.ok, false);
console.log("Invalid invite rejected.");
const initial = await request(token, "state");
assert.equal(initial.songs.length, 94);
assert.equal(initial.members.some((member) => member.name === "Sara Acheson"), true);
assert.equal(JSON.stringify(initial).includes(token), false);
assert.equal(JSON.stringify(initial).includes("@"), false);
console.log(`Live songs loaded: ${initial.songs.length}; active musicians: ${initial.members.length}. Sara's name is correct.`);
const song = initial.songs.find((item) => !initial.myVotes.includes(item.id) && !initial.claims.some((claim) => claim.songId === item.id && claim.memberId === initial.viewer.id && claim.role === "guitar"));
assert.ok(song, "Need an unused song for a reversible own-account test.");
const initialCount = initial.votes[song.id] || 0;
let voteWritten = false, claimWritten = false, statusWritten = false;
try {
  voteWritten = true;
  const voted = await request(token, "vote", { songId: song.id, selected: true });
  assert.equal(voted.votes[song.id], initialCount + 1);
  const reloaded = await request(token, "state");
  assert.equal(reloaded.myVotes.includes(song.id), true);
  const observed = await request(observerToken, "state");
  assert.equal(observed.votes[song.id], initialCount + 1);
  console.log("Guest vote persisted and is visible through a second invitation.");
  if (!initial.viewer.enabled) { statusWritten = true; await request(token, "participation", { enabled: true }); }
  claimWritten = true;
  await request(token, "setClaim", { songId: song.id, role: "guitar", selected: true });
  const claimed = await request(observerToken, "state");
  assert.equal(claimed.claims.some((claim) => claim.songId === song.id && claim.role === "guitar" && claim.memberId === initial.viewer.id), true);
  console.log("Musician opt-in and shared instrument claim persisted.");
} finally {
  if (claimWritten) await request(token, "setClaim", { songId: song.id, role: "guitar", selected: false });
  if (statusWritten) await request(token, "participation", { enabled: initial.viewer.enabled });
  if (voteWritten) await request(token, "vote", { songId: song.id, selected: false });
  console.log("Own-account test vote, instrument claim, and musician status restored.");
}
