const SHEETS = { invitees: "Invitees", contacts: "Contacts", responses: "Responses" };

const HEADERS = {
  Invitees: ["householdId", "householdLabel", "primaryName", "partnerName", "inviteToken", "contactStatus", "primaryInviteToken", "partnerInviteToken"],
  Contacts: ["householdId", "email", "phone", "dm", "contactPreference", "contactSource", "contactStatus", "detailsConfirmed", "householdType", "shareMethod", "shareStatus", "lastSharedAt", "lastEditedBy", "suggestion", "primaryEmail", "primaryPhone", "primaryDm", "primaryContactPreference", "primaryContactSource", "primaryContacted", "primaryLastContactedAt", "partnerEmail", "partnerPhone", "partnerDm", "partnerContactPreference", "partnerContactSource", "partnerContacted", "partnerLastContactedAt"],
  Responses: ["submittedAt", "householdId", "inviteToken", "status", "partnerComing", "partnerNameOverride", "email", "phone", "dm", "note"],
};

function doGet(e) {
  try {
    const action = String(e.parameter.action || "");
    if (action === "invite") return json(loadInvite(e.parameter.token));
    if (action === "adminList") return json(loadAdminList(e.parameter.adminKey));
    return json({ ok: false, error: "Unknown action." });
  } catch (error) { return json({ ok: false, error: String(error.message || error) }); }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action === "submitRsvp") return json(submitRsvp(payload));
    if (payload.action === "updateContact") return json(updateContact(payload));
    return json({ ok: false, error: "Unknown action." });
  } catch (error) { return json({ ok: false, error: String(error.message || error) }); }
}

function setupSheets() { Object.keys(HEADERS).forEach(ensureSheet); ensureInviteTokens(); }

function loadInvite(token) {
  const found = findInviteByToken(token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const invite = found.invite;
  const isPartner = found.role === "partner";
  const contact = objectBy(readSheet(SHEETS.contacts), "householdId")[invite.householdId] || {};
  return { ok: true, invite: {
    householdId: invite.householdId,
    householdLabel: invite.householdLabel,
    primaryName: isPartner ? invite.partnerName : invite.primaryName,
    partnerName: isPartner ? invite.primaryName : invite.partnerName,
    email: isPartner ? (contact.partnerEmail || "") : (contact.primaryEmail || contact.email || ""),
    phone: isPartner ? (contact.partnerPhone || "") : (contact.primaryPhone || contact.phone || ""),
    dm: isPartner ? (contact.partnerDm || "") : (contact.primaryDm || contact.dm || ""),
    lastResponse: findLastResponseByHousehold(invite.householdId),
  }};
}

function submitRsvp(payload) {
  const status = String(payload.status || "").toLowerCase();
  if (["yes", "maybe", "no"].indexOf(status) === -1) return { ok: false, error: "Choose yes, maybe, or no." };
  const found = findInviteByToken(payload.token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const invite = found.invite;
  getSheet(SHEETS.responses).appendRow([new Date().toISOString(), invite.householdId, clean(payload.token), status, Boolean(payload.partnerComing), clean(payload.partnerNameOverride), clean(payload.email), clean(payload.phone), clean(payload.dm), clean(payload.note)]);
  return { ok: true, message: "RSVP saved." };
}

function loadAdminList(adminKey) {
  requireAdmin(adminKey);
  ensureInviteTokens();
  const invitees = readSheet(SHEETS.invitees);
  const contactsById = objectBy(readSheet(SHEETS.contacts), "householdId");
  const latestResponses = latestResponsesByHousehold();
  return { ok: true, rows: invitees.map((invite) => {
    const contact = contactsById[invite.householdId] || {};
    const response = latestResponses[invite.householdId] || null;
    return {
      householdId: invite.householdId, householdLabel: invite.householdLabel, primaryName: invite.primaryName, partnerName: invite.partnerName,
      inviteToken: invite.primaryInviteToken || invite.inviteToken,
      primaryInviteToken: invite.primaryInviteToken || invite.inviteToken,
      partnerInviteToken: invite.partnerInviteToken || "",
      email: contact.primaryEmail || contact.email || "", phone: contact.primaryPhone || contact.phone || "", dm: contact.primaryDm || contact.dm || "",
      contactPreference: contact.primaryContactPreference || contact.contactPreference || "", contactSource: contact.primaryContactSource || contact.contactSource || "",
      contactStatus: contact.contactStatus || invite.contactStatus || "needs contact", detailsConfirmed: contact.detailsConfirmed === true || contact.detailsConfirmed === "true",
      householdType: contact.householdType || (invite.partnerName ? "couple" : "single"), shareMethod: contact.shareMethod || "", shareStatus: contact.shareStatus || "not shared", lastSharedAt: contact.lastSharedAt || "",
      rsvpStatus: response ? response.status : "waiting", lastRespondedAt: response ? response.submittedAt : "",
      primaryEmail: contact.primaryEmail || contact.email || "", primaryPhone: contact.primaryPhone || contact.phone || "", primaryDm: contact.primaryDm || contact.dm || "",
      primaryContactPreference: contact.primaryContactPreference || contact.contactPreference || "", primaryContactSource: contact.primaryContactSource || contact.contactSource || "",
      primaryContacted: contact.primaryContacted === true || contact.primaryContacted === "true", primaryLastContactedAt: contact.primaryLastContactedAt || "",
      partnerEmail: contact.partnerEmail || "", partnerPhone: contact.partnerPhone || "", partnerDm: contact.partnerDm || "",
      partnerContactPreference: contact.partnerContactPreference || "", partnerContactSource: contact.partnerContactSource || "",
      partnerContacted: contact.partnerContacted === true || contact.partnerContacted === "true", partnerLastContactedAt: contact.partnerLastContactedAt || "",
      suggestion: contact.suggestion || "",
    };
  }) };
}

function updateContact(payload) {
  requireAdmin(payload.adminKey);
  const householdId = clean(payload.householdId);
  if (!householdId) return { ok: false, error: "Missing household." };
  const sheet = getSheet(SHEETS.contacts), rows = readSheet(SHEETS.contacts), index = rows.findIndex((row) => row.householdId === householdId), previous = index >= 0 ? rows[index] : {};
  const next = {
    householdId, email: clean(payload.email), phone: clean(payload.phone), dm: clean(payload.dm), contactPreference: clean(payload.contactPreference), contactSource: clean(payload.contactSource),
    contactStatus: clean(payload.contactStatus) || "needs contact", detailsConfirmed: Boolean(payload.detailsConfirmed), householdType: clean(payload.householdType) || "unknown", shareMethod: clean(payload.shareMethod), shareStatus: clean(payload.shareStatus) || "not shared", lastSharedAt: clean(payload.lastSharedAt), lastEditedBy: clean(payload.helperName), suggestion: previous.suggestion || "",
    primaryEmail: clean(payload.primaryEmail), primaryPhone: clean(payload.primaryPhone), primaryDm: clean(payload.primaryDm), primaryContactPreference: clean(payload.primaryContactPreference), primaryContactSource: clean(payload.primaryContactSource), primaryContacted: Boolean(payload.primaryContacted), primaryLastContactedAt: clean(payload.primaryLastContactedAt),
    partnerEmail: clean(payload.partnerEmail), partnerPhone: clean(payload.partnerPhone), partnerDm: clean(payload.partnerDm), partnerContactPreference: clean(payload.partnerContactPreference), partnerContactSource: clean(payload.partnerContactSource), partnerContacted: Boolean(payload.partnerContacted), partnerLastContactedAt: clean(payload.partnerLastContactedAt),
  };
  const values = HEADERS.Contacts.map((header) => next[header] === undefined ? "" : next[header]);
  if (index >= 0) sheet.getRange(index + 2, 1, 1, values.length).setValues([values]); else sheet.appendRow(values);
  return { ok: true, row: next };
}

function requireAdmin(adminKey) { const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY"); if (!expected) throw new Error("ADMIN_KEY script property is not set."); if (String(adminKey || "") !== expected) throw new Error("Invalid admin key."); }

function findInviteByToken(token) {
  const cleanToken = clean(token); if (!cleanToken) return null;
  ensureInviteTokens();
  const invite = readSheet(SHEETS.invitees).find((row) => row.primaryInviteToken === cleanToken || row.inviteToken === cleanToken || row.partnerInviteToken === cleanToken);
  if (!invite) return null;
  return { invite, role: invite.partnerInviteToken === cleanToken ? "partner" : "primary" };
}

function findLastResponseByHousehold(householdId) { const rows = readSheet(SHEETS.responses); for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].householdId === householdId) return { status: rows[i].status, partnerComing: rows[i].partnerComing === true || rows[i].partnerComing === "true", submittedAt: rows[i].submittedAt }; return null; }
function latestResponsesByHousehold() { const output = {}; readSheet(SHEETS.responses).forEach((row) => { if (row.householdId) output[row.householdId] = row; }); return output; }
function ensureInviteTokens() { const sheet = getSheet(SHEETS.invitees), rows = readSheet(SHEETS.invitees); rows.forEach((row, index) => { const primary = row.primaryInviteToken || row.inviteToken || Utilities.getUuid().replace(/-/g, ""); const partner = row.partnerName ? row.partnerInviteToken || Utilities.getUuid().replace(/-/g, "") : ""; if (primary !== row.primaryInviteToken || partner !== row.partnerInviteToken) { const headers = headerMap(sheet); sheet.getRange(index + 2, headers.primaryInviteToken, 1, 1).setValue(primary); sheet.getRange(index + 2, headers.partnerInviteToken, 1, 1).setValue(partner); if (!row.inviteToken) sheet.getRange(index + 2, headers.inviteToken, 1, 1).setValue(primary); } }); }
function ensureSheet(name) { const spreadsheet = getSpreadsheet(), headers = HEADERS[name]; let sheet = spreadsheet.getSheetByName(name); if (!sheet) sheet = spreadsheet.insertSheet(name); const current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : []; headers.forEach((header) => { if (current.indexOf(header) === -1) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); current.push(header); } }); sheet.setFrozenRows(1); return sheet; }
function headerMap(sheet) { const map = {}; sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].forEach((value, index) => { map[String(value)] = index + 1; }); return map; }
function readSheet(name) { const sheet = getSheet(name), values = sheet.getDataRange().getValues(); if (values.length < 2) return []; const headers = values[0].map(String); return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => { const record = {}; headers.forEach((header, index) => { record[header] = row[index]; }); return record; }); }
function getSheet(name) { return ensureSheet(name); }
function getSpreadsheet() { const sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID"); return sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet(); }
function objectBy(rows, key) { const output = {}; rows.forEach((row) => { output[row[key]] = row; }); return output; }
function clean(value) { return String(value || "").trim(); }
function json(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }