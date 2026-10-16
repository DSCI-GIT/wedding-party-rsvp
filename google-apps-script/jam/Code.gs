/* Standalone music endpoint. Uses the existing private RSVP Sheet and invitation tokens.
 * Deploy separately from the RSVP script. setupJamBoard only adds missing music data.
 */
const JAM_TABLES = {
  JamSongs: ["id", "title", "artist", "options", "needsReview", "reviewNote", "bandOrder", "acousticOrder"],
  JamParticipants: ["memberId", "enabled", "updatedAt"],
  JamClaims: ["songId", "role", "memberId", "updatedAt"],
  JamArtists: ["songId", "artist", "revision", "updatedBy", "updatedAt"],
  JamVotes: ["songId", "memberId", "updatedAt"],
};
const JAM_INSTRUMENTS = ["guitar", "bass", "drums", "vocals", "acoustic", "percussion"];
const JAM_DEFAULT_MEMBERS = [
  { householdId: "simon-carroll", role: "primary", initials: "SC" },
  { householdId: "kat-mark", role: "primary", initials: "K" },
  { householdId: "celia-matt", role: "partner", initials: "MR" },
  { householdId: "zuzu-adam", role: "partner", initials: "AM" },
  { householdId: "sarah-jon", role: "partner", initials: "JA" },
  { householdId: "sarah-jon", role: "primary", initials: "SA" },
  { householdId: "nicole-mike", role: "partner", initials: "MB" },
];

function doGet() { return jamJson({ ok: true, service: "wedding-jam", version: 2 }); }
function doPost(event) {
  let lock;
  try {
    if (!event.postData || event.postData.contents.length > 60000) throw new Error("Invalid request.");
    const payload = JSON.parse(event.postData.contents);
    const invites = jamRead("Invitees"), identity = jamIdentity(payload.token, invites);
    if (!identity) return jamJson({ ok: false, error: "Open the board using your personal wedding invitation link." });
    if (payload.action === "state") return jamJson({ ok: true, state: jamState(identity, invites) });
    if (payload.action === "batch") {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw new Error("The board is busy. Please try again shortly.");
      return jamJson(jamSaveBatch(payload, identity, invites));
    }
    if (["participation", "setClaim", "artist", "vote"].indexOf(payload.action) < 0) throw new Error("Unknown music action.");
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error("The board is busy. Please try again shortly.");
    const participants = jamRead("JamParticipants"), viewer = jamMember(identity, participants);
    const now = new Date().toISOString();
    if (payload.action === "participation") {
      if (typeof payload.enabled !== "boolean") throw new Error("Choose whether you are joining the band.");
      jamUpsert("JamParticipants", participants, (row) => row.memberId === viewer.id, { memberId: viewer.id, enabled: payload.enabled, updatedAt: now });
    } else {
      const song = jamSongs().find((row) => row.id === payload.songId);
      if (!song) throw new Error("Unknown song.");
      if (payload.action === "vote") {
        if (typeof payload.selected !== "boolean") throw new Error("Choose whether you want to vote for this song.");
        const votes = jamRead("JamVotes"), matches = votes.map((row, index) => ({ row, index })).filter((item) => item.row.songId === song.id && item.row.memberId === viewer.id);
        if (payload.selected && !matches.length) jamAppend("JamVotes", { songId: song.id, memberId: viewer.id, updatedAt: now });
        if (!payload.selected) matches.reverse().forEach((item) => jamSheet("JamVotes").deleteRow(item.index + 2));
      } else if (!viewer.enabled) throw new Error("Switch on your musician status before choosing parts or artists.");
      else if (payload.action === "setClaim") {
        if (JAM_INSTRUMENTS.indexOf(payload.role) < 0 || typeof payload.selected !== "boolean") throw new Error("Choose a listed instrument.");
        const claims = jamRead("JamClaims");
        const matches = claims.map((row, index) => ({ row, index })).filter((item) => item.row.songId === song.id && item.row.role === payload.role && item.row.memberId === viewer.id);
        if (payload.selected && matches.length === 0) jamAppend("JamClaims", { songId: song.id, role: payload.role, memberId: viewer.id, updatedAt: now });
        if (!payload.selected) matches.reverse().forEach((item) => jamSheet("JamClaims").deleteRow(item.index + 2));
      } else {
        if (typeof payload.artist !== "string" || song.options.concat(song.needsReview ? ["Needs confirmation"] : []).indexOf(payload.artist) < 0) throw new Error("Choose an artist from the listed versions.");
        const choices = jamRead("JamArtists"), existing = choices.find((row) => row.songId === song.id), revision = existing ? Number(existing.revision) || 0 : 0;
        if (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision !== revision) throw new Error("Someone just updated this artist. Refresh the board to see their choice, then choose again.");
        jamUpsert("JamArtists", choices, (row) => row.songId === song.id, { songId: song.id, artist: payload.artist, revision: revision + 1, updatedBy: viewer.id, updatedAt: now });
      }
    }
    SpreadsheetApp.flush();
    return jamJson({ ok: true, state: jamState(identity, invites) });
  } catch (error) {
    console.error(String(error));
    const message = String(error.message || error);
    const safe = /^(Open the board|Unknown (music action|song)|Choose |Switch on|Someone just|The board is busy|Invalid request)/.test(message);
    return jamJson({ ok: false, error: safe ? message : "Shared music storage is unavailable. Please try again shortly." });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function jamSaveBatch(payload, identity, invites) {
  if (typeof payload.clientId !== "string" || !/^[a-zA-Z0-9-]{20,60}$/.test(payload.clientId) || !Number.isSafeInteger(payload.revision) || payload.revision < 1 || !Array.isArray(payload.changes) || !payload.changes.length || payload.changes.length > 700) throw new Error("Invalid request.");
  const properties = PropertiesService.getScriptProperties(), key = "JAM_SYNC_" + identity.id + ":" + payload.clientId;
  const previous = Number(properties.getProperty(key) || 0);
  // Exit delivery and retries may arrive out of order. Older snapshots must never win.
  if (payload.revision <= previous) return { ok: true, state: jamState(identity, invites), ackRevision: payload.revision };
  const tables = { JamParticipants: jamRead("JamParticipants"), JamClaims: jamRead("JamClaims"), JamVotes: jamRead("JamVotes"), JamArtists: jamRead("JamArtists") };
  const changed = new Set(), songs = jamSongs(), now = new Date().toISOString();
  function upsert(name, predicate, record) { const index = tables[name].findIndex(predicate); if (index < 0) tables[name].push(record); else tables[name][index] = record; changed.add(name); }
  function remove(name, predicate) { tables[name] = tables[name].filter((row) => !predicate(row)); changed.add(name); }
  // Validate the complete batch in memory before writing any music tables.
  payload.changes.forEach((change) => {
    if (!change || typeof change !== "object") throw new Error("Invalid request.");
    if (change.action === "participation") {
      if (typeof change.enabled !== "boolean") throw new Error("Choose whether you are joining the band.");
      upsert("JamParticipants", (row) => row.memberId === identity.id, { memberId: identity.id, enabled: change.enabled, updatedAt: now });
      return;
    }
    const song = songs.find((row) => row.id === change.songId);
    if (!song) throw new Error("Unknown song.");
    if (change.action === "vote") {
      if (typeof change.selected !== "boolean") throw new Error("Choose whether you want to vote for this song.");
      const matches = (row) => row.songId === song.id && row.memberId === identity.id;
      if (change.selected) upsert("JamVotes", matches, { songId: song.id, memberId: identity.id, updatedAt: now }); else remove("JamVotes", matches);
      return;
    }
    if (!jamMember(identity, tables.JamParticipants).enabled) throw new Error("Switch on your musician status before choosing parts or artists.");
    if (change.action === "setClaim") {
      if (JAM_INSTRUMENTS.indexOf(change.role) < 0 || typeof change.selected !== "boolean") throw new Error("Choose a listed instrument.");
      const matches = (row) => row.songId === song.id && row.role === change.role && row.memberId === identity.id;
      if (change.selected) upsert("JamClaims", matches, { songId: song.id, role: change.role, memberId: identity.id, updatedAt: now }); else remove("JamClaims", matches);
    } else if (change.action === "artist") {
      if (typeof change.artist !== "string" || song.options.concat(song.needsReview ? ["Needs confirmation"] : []).indexOf(change.artist) < 0) throw new Error("Choose an artist from the listed versions.");
      const existing = tables.JamArtists.find((row) => row.songId === song.id), revision = existing ? Number(existing.revision) || 0 : 0;
      if (existing && existing.artist === change.artist) return;
      if (!Number.isInteger(change.expectedRevision) || change.expectedRevision !== revision) throw new Error("Someone just updated this artist. Refresh the board to see their choice, then choose again.");
      upsert("JamArtists", (row) => row.songId === song.id, { songId: song.id, artist: change.artist, revision: revision + 1, updatedBy: identity.id, updatedAt: now });
    } else throw new Error("Unknown music action.");
  });
  changed.forEach((name) => {
    const sheet = jamSheet(name), oldCount = Math.max(0, sheet.getLastRow() - 1), rows = tables[name].map((record) => JAM_TABLES[name].map((header) => jamText(record[header] === undefined ? "" : record[header])));
    if (rows.length) sheet.getRange(2, 1, rows.length, JAM_TABLES[name].length).setValues(rows);
    if (oldCount > rows.length) sheet.getRange(rows.length + 2, 1, oldCount - rows.length, JAM_TABLES[name].length).clearContent();
  });
  SpreadsheetApp.flush();
  properties.setProperty(key, String(payload.revision));
  return { ok: true, state: jamState(identity, invites), ackRevision: payload.revision };
}

function jamDatabase() {
  const id = PropertiesService.getScriptProperties().getProperty("JAM_SPREADSHEET_ID") || (typeof JAM_DATABASE_ID !== "undefined" ? JAM_DATABASE_ID : "");
  if (!id) throw new Error("Missing music spreadsheet configuration.");
  return SpreadsheetApp.openById(id);
}
function jamSheet(name) { const sheet = jamDatabase().getSheetByName(name); if (!sheet) throw new Error("Music storage needs setup."); return sheet; }
function jamRead(name) {
  const values = jamSheet(name).getDataRange().getValues(), headers = values.shift() || [];
  return values.filter((row) => String(row[0] || "").trim()).map((row) => Object.fromEntries(headers.map((header, index) => [String(header), row[index]])));
}
function jamIdentity(token, invites) {
  if (typeof token !== "string" || !/^[-A-Za-z0-9_]{20,160}$/.test(token)) return null;
  for (const invite of invites) {
    if (invite.primaryInviteToken === token || invite.inviteToken === token) return { id: invite.householdId + ":primary", householdId: invite.householdId, role: "primary", name: String(invite.primaryName || "Guest") };
    if (invite.partnerName && invite.partnerInviteToken === token) return { id: invite.householdId + ":partner", householdId: invite.householdId, role: "partner", name: String(invite.partnerName) };
  }
  return null;
}
function jamEnabled(value) { return value === true || String(value).toLowerCase() === "true"; }
function jamMember(identity, participants) {
  const saved = participants.find((row) => row.memberId === identity.id), preset = JAM_DEFAULT_MEMBERS.find((row) => row.householdId === identity.householdId && row.role === identity.role);
  const names = identity.name.trim().split(/\s+/), initials = preset ? preset.initials : names.length > 1 ? names[0].charAt(0) + names[names.length - 1].charAt(0) : names[0].slice(0, 2);
  return { id: identity.id, name: identity.name, initials: initials.toUpperCase(), enabled: saved ? jamEnabled(saved.enabled) : Boolean(preset) };
}
function jamSongs() {
  return jamRead("JamSongs").map((song) => ({ id: String(song.id), title: String(song.title), artist: String(song.artist), options: JSON.parse(song.options || "[]"), needsReview: jamEnabled(song.needsReview), reviewNote: String(song.reviewNote || ""), bandOrder: song.bandOrder === "" ? null : Number(song.bandOrder), acousticOrder: song.acousticOrder === "" ? null : Number(song.acousticOrder) }));
}
function jamState(identity, invites) {
  const participants = jamRead("JamParticipants"), members = [];
  invites.forEach((invite) => {
    for (const role of ["primary", "partner"]) {
      const name = role === "primary" ? invite.primaryName : invite.partnerName;
      if (!name) continue;
      const member = jamMember({ id: invite.householdId + ":" + role, householdId: invite.householdId, role, name: String(name) }, participants);
      if (member.enabled) members.push(member);
    }
  });
  const activeIds = new Set(members.map((member) => member.id));
  const allClaims = jamRead("JamClaims").map((claim) => ({ songId: claim.songId, role: claim.role, memberId: claim.memberId }));
  const claims = allClaims.filter((claim) => activeIds.has(claim.memberId)), ownClaims = allClaims.filter((claim) => claim.memberId === identity.id);
  const choices = Object.fromEntries(jamRead("JamArtists").map((row) => [row.songId, { artist: row.artist, revision: Number(row.revision) || 0 }]));
  const voteRows = jamRead("JamVotes"), unique = new Set(), votes = {}, myVotes = [];
  voteRows.forEach((row) => { const key = row.songId + ":" + row.memberId; if (unique.has(key)) return; unique.add(key); votes[row.songId] = (votes[row.songId] || 0) + 1; if (row.memberId === identity.id) myVotes.push(row.songId); });
  return { viewer: jamMember(identity, participants), members, songs: jamSongs(), claims, ownClaims, choices, votes, myVotes };
}
function jamText(value) { return typeof value === "string" && /^[=+\-@]/.test(value) ? "'" + value : value; }
function jamAppend(name, record) { jamSheet(name).appendRow(JAM_TABLES[name].map((header) => jamText(record[header] === undefined ? "" : record[header]))); }
function jamUpsert(name, rows, predicate, record) {
  const index = rows.findIndex(predicate);
  if (index < 0) jamAppend(name, record);
  else jamSheet(name).getRange(index + 2, 1, 1, JAM_TABLES[name].length).setValues([JAM_TABLES[name].map((header) => jamText(record[header] === undefined ? "" : record[header]))]);
}
function jamJson(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

function setupJamBoard() {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const db = jamDatabase();
    Object.keys(JAM_TABLES).forEach((name) => {
      let sheet = db.getSheetByName(name);
      if (!sheet) sheet = db.insertSheet(name);
      if (sheet.getLastRow() === 0) sheet.appendRow(JAM_TABLES[name]);
      const headers = sheet.getRange(1, 1, 1, JAM_TABLES[name].length).getValues()[0];
      if (JSON.stringify(headers) !== JSON.stringify(JAM_TABLES[name])) throw new Error("Unexpected headers on " + name + ". Existing data was preserved.");
      sheet.setFrozenRows(1);
    });
    if (typeof JAM_SONG_SEED === "undefined") {
      if (jamRead("JamSongs").length) return "Existing music storage is ready. No data was replaced.";
      throw new Error("Missing song seed. Use the generated complete deployment file.");
    }
    const existing = new Set(jamRead("JamSongs").map((row) => row.id));
    const missing = JAM_SONG_SEED.filter((song) => !existing.has(song.id)).map((song) => JAM_TABLES.JamSongs.map((header) => jamText(header === "options" ? JSON.stringify(song.options) : song[header] === null ? "" : song[header])));
    if (missing.length) jamSheet("JamSongs").getRange(jamSheet("JamSongs").getLastRow() + 1, 1, missing.length, JAM_TABLES.JamSongs.length).setValues(missing);
    return "Music storage ready. Added " + missing.length + " songs. Existing RSVP and music data preserved.";
  } finally { lock.releaseLock(); }
}
