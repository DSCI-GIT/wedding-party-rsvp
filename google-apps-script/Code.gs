const SHEETS = { invitees: "Invitees", contacts: "Contacts", responses: "Responses", announcements: "Announcements", chatMessages: "ChatMessages", guestProfiles: "GuestProfiles", campaigns: "Campaigns", campaignRecipients: "CampaignRecipients" };

const HEADERS = {
  Invitees: ["householdId", "householdLabel", "primaryName", "partnerName", "inviteToken", "contactStatus", "primaryInviteToken", "partnerInviteToken"],
  Contacts: ["householdId", "email", "phone", "dm", "contactPreference", "contactSource", "contactStatus", "detailsConfirmed", "householdType", "shareMethod", "shareStatus", "lastSharedAt", "lastEditedBy", "suggestion", "primaryEmail", "primaryPhone", "primaryDm", "primaryContactPreference", "primaryContactSource", "primaryContacted", "primaryLastContactedAt", "partnerEmail", "partnerPhone", "partnerDm", "partnerContactPreference", "partnerContactSource", "partnerContacted", "partnerLastContactedAt"],
  Responses: ["submittedAt", "householdId", "inviteToken", "status", "partnerComing", "partnerNameOverride", "email", "phone", "dm", "note"],
  Announcements: ["id", "title", "body", "photoUrl", "pinned", "published", "publishedAt", "createdAt", "createdBy"],
  ChatMessages: ["id", "token", "householdId", "displayName", "body", "kind", "createdAt", "visible", "deleted", "pinned"],
  GuestProfiles: ["token", "householdId", "displayName", "mutedUntil", "updatedAt"],
  Campaigns: ["id", "title", "subject", "body", "createdAt", "createdBy", "recipientCount", "emailSentCount", "sharedCount"],
  CampaignRecipients: ["id", "campaignId", "householdId", "token", "name", "email", "phone", "dm", "emailStatus", "emailSentAt", "shareStatus", "sharedAt"],
};

function doGet(e) {
  try {
    const action = String(e.parameter.action || "");
    if (action === "invite") return json(loadInvite(e.parameter.token));
    if (action === "adminList") return json(loadAdminList(e.parameter.adminKey));
    if (action === "adminResponses") return json(loadAdminResponses(e.parameter.adminKey));
    if (action === "community") return json(loadCommunity(e.parameter.token));
    if (action === "adminCommunity") return json(loadAdminCommunity(e.parameter.adminKey));
    return json({ ok: false, error: "Unknown action." });
  } catch (error) { return json({ ok: false, error: String(error.message || error) }); }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action === "submitRsvp") return json(submitRsvp(payload));
    if (payload.action === "updateContact") return json(updateContact(payload));
    if (payload.action === "backfillRsvpContacts") return json(backfillRsvpContacts(payload.adminKey));
    if (payload.action === "splitHousehold") return json(splitHousehold(payload));
    if (payload.action === "setUsername") return json(setUsername(payload));
    if (payload.action === "postMessage") return json(postMessage(payload));
    if (payload.action === "saveAnnouncement") return json(saveAnnouncement(payload));
    if (payload.action === "moderateMessage") return json(moderateMessage(payload));
    if (payload.action === "createCampaign") return json(createCampaign(payload));
    if (payload.action === "sendCampaignEmails") return json(sendCampaignEmails(payload));
    if (payload.action === "recordCampaignShare") return json(recordCampaignShare(payload));
    if (payload.action === "uploadAnnouncementPhoto") return json(uploadAnnouncementPhoto(payload));
    if (payload.action === "resetDemoData") return json(resetDemoData(payload));
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
  const lastResponse = findLastResponseByHousehold(invite.householdId, invite);
  const partnerAnsweredForViewer = Boolean(
    invite.partnerName &&
    lastResponse &&
    lastResponse.responderRole !== found.role &&
    lastResponse.partnerComing
  );
  return { ok: true, invite: {
    householdId: invite.householdId,
    householdLabel: invite.householdLabel,
    primaryName: isPartner ? invite.partnerName : invite.primaryName,
    partnerName: isPartner ? invite.primaryName : invite.partnerName,
    email: isPartner ? (contact.partnerEmail || "") : (contact.primaryEmail || contact.email || ""),
    phone: isPartner ? (contact.partnerPhone || "") : (contact.primaryPhone || contact.phone || ""),
    dm: isPartner ? (contact.partnerDm || "") : (contact.primaryDm || contact.dm || ""),
    viewerRole: found.role,
    lastResponse,
    partnerAnsweredForViewer,
    partnerResponderName: partnerAnsweredForViewer ? lastResponse.responderName : "",
  }};
}

function submitRsvp(payload) {
  const status = String(payload.status || "").toLowerCase();
  if (["yes", "maybe", "no"].indexOf(status) === -1) return { ok: false, error: "Choose yes, maybe, or no." };
  const found = findInviteByToken(payload.token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const invite = found.invite;
  getSheet(SHEETS.responses).appendRow([new Date().toISOString(), invite.householdId, clean(payload.token), status, Boolean(payload.partnerComing), clean(payload.partnerNameOverride), clean(payload.email), spreadsheetText(cleanRsvpPhone(payload.phone)), clean(payload.dm), clean(payload.note)]);
  updateContactFromRsvp(invite, found.role, payload);
  return { ok: true, message: "RSVP saved." };
}


function cleanRsvpPhone(value) {
  const phone = clean(value);
  if (!phone || phone.indexOf("#ERROR") !== -1 || phone.replace(/\D/g, "").length < 7) return "";
  return phone;
}

function spreadsheetText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function updateContactFromRsvp(invite, role, payload) {
  const sheet = getSheet(SHEETS.contacts);
  const rows = readSheet(SHEETS.contacts);
  const index = rows.findIndex((row) => row.householdId === invite.householdId);
  if (index < 0) return;
  const next = { ...rows[index] };
  const prefix = role === "partner" ? "partner" : "primary";
  const email = clean(payload.email), phone = cleanRsvpPhone(payload.phone), dm = clean(payload.dm);
  if (email) next[`${prefix}Email`] = email;
  if (phone) next[`${prefix}Phone`] = spreadsheetText(phone);
  if (dm) next[`${prefix}Dm`] = dm;
  if (email || phone || dm) next[`${prefix}ContactSource`] = "RSVP confirmation";
  if (role !== "partner") {
    if (email) next.email = email;
    if (phone) next.phone = spreadsheetText(phone);
    if (dm) next.dm = dm;
    if (email || phone || dm) next.contactSource = "RSVP confirmation";
  }
  writeRecord(sheet, index + 2, HEADERS.Contacts, next);
}
function backfillRsvpContacts(adminKey) {
  requireAdmin(adminKey);
  const invitees = objectBy(readSheet(SHEETS.invitees), "householdId");
  let updated = 0;
  readSheet(SHEETS.responses).forEach((response) => {
    const invite = invitees[response.householdId];
    if (!invite || !(clean(response.email) || cleanRsvpPhone(response.phone) || clean(response.dm))) return;
    const role = invite.partnerInviteToken && invite.partnerInviteToken === clean(response.inviteToken) ? "partner" : "primary";
    updateContactFromRsvp(invite, role, response);
    updated += 1;
  });
  return { ok: true, updated };
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


function loadAdminResponses(adminKey) {
  requireAdmin(adminKey);
  const invitees = objectBy(readSheet(SHEETS.invitees), "householdId");
  const responses = readSheet(SHEETS.responses).slice().reverse();
  return { ok: true, responses: responses.map((response) => {
    const invite = invitees[response.householdId] || {};
    const responderRole = invite.partnerInviteToken && invite.partnerInviteToken === response.inviteToken ? "partner" : "primary";
    return {
      householdId: response.householdId,
      householdLabel: invite.householdLabel || response.householdId,
      primaryName: invite.primaryName || "Guest",
      partnerName: invite.partnerName || "",
      responderRole,
      responderName: responderRole === "partner" ? invite.partnerName || "Guest" : invite.primaryName || "Guest",
      status: response.status,
      partnerComing: response.partnerComing === true || response.partnerComing === "true",
      submittedAt: response.submittedAt,
      note: response.note || ""
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


function splitHousehold(payload) {
  requireAdmin(payload.adminKey);
  const householdId = clean(payload.householdId);
  const inviteSheet = getSheet(SHEETS.invitees);
  const inviteRows = readSheet(SHEETS.invitees);
  const inviteIndex = inviteRows.findIndex((row) => row.householdId === householdId);
  if (inviteIndex < 0) return { ok: false, error: "Household not found." };
  const invite = inviteRows[inviteIndex];
  if (!invite.partnerName) return { ok: false, error: "This household is already a single guest." };

  const existingIds = inviteRows.map((row) => row.householdId);
  const createdId = uniqueHouseholdId(`${householdId}-${invite.partnerName}`, existingIds);
  const primaryToken = invite.primaryInviteToken || invite.inviteToken || Utilities.getUuid().replace(/-/g, "");
  const partnerToken = invite.partnerInviteToken || Utilities.getUuid().replace(/-/g, "");
  const primaryInvite = { ...invite, householdLabel: invite.primaryName, partnerName: "", inviteToken: primaryToken, primaryInviteToken: primaryToken, partnerInviteToken: "", contactStatus: invite.contactStatus || "needs contact" };
  const partnerInvite = { ...invite, householdId: createdId, householdLabel: invite.partnerName, primaryName: invite.partnerName, partnerName: "", inviteToken: partnerToken, primaryInviteToken: partnerToken, partnerInviteToken: "", contactStatus: invite.contactStatus || "needs contact" };
  writeRecord(inviteSheet, inviteIndex + 2, HEADERS.Invitees, primaryInvite);
  inviteSheet.appendRow(HEADERS.Invitees.map((header) => partnerInvite[header] || ""));

  const contactSheet = getSheet(SHEETS.contacts);
  const contactRows = readSheet(SHEETS.contacts);
  const contactIndex = contactRows.findIndex((row) => row.householdId === householdId);
  const contact = contactIndex >= 0 ? contactRows[contactIndex] : { householdId };
  const primaryEmail = contact.primaryEmail || contact.email || "";
  const primaryPhone = contact.primaryPhone || contact.phone || "";
  const primaryDm = contact.primaryDm || contact.dm || "";
  const primaryPreference = contact.primaryContactPreference || contact.contactPreference || "";
  const primarySource = contact.primaryContactSource || contact.contactSource || "";
  const partnerEmail = contact.partnerEmail || "";
  const partnerPhone = contact.partnerPhone || "";
  const partnerDm = contact.partnerDm || "";
  const partnerPreference = contact.partnerContactPreference || "";
  const partnerSource = contact.partnerContactSource || "";
  const primaryContact = { ...contact, householdId, email: primaryEmail, phone: primaryPhone, dm: primaryDm, contactPreference: primaryPreference, contactSource: primarySource, householdType: "single", partnerEmail: "", partnerPhone: "", partnerDm: "", partnerContactPreference: "", partnerContactSource: "", partnerContacted: false, partnerLastContactedAt: "", lastEditedBy: clean(payload.helperName) };
  const partnerContact = { ...contact, householdId: createdId, email: partnerEmail, phone: partnerPhone, dm: partnerDm, contactPreference: partnerPreference, contactSource: partnerSource, householdType: "single", primaryEmail: partnerEmail, primaryPhone: partnerPhone, primaryDm: partnerDm, primaryContactPreference: partnerPreference, primaryContactSource: partnerSource, primaryContacted: contact.partnerContacted === true || contact.partnerContacted === "true", primaryLastContactedAt: contact.partnerLastContactedAt || "", partnerEmail: "", partnerPhone: "", partnerDm: "", partnerContactPreference: "", partnerContactSource: "", partnerContacted: false, partnerLastContactedAt: "", lastEditedBy: clean(payload.helperName) };
  if (contactIndex >= 0) writeRecord(contactSheet, contactIndex + 2, HEADERS.Contacts, primaryContact); else contactSheet.appendRow(HEADERS.Contacts.map((header) => primaryContact[header] || ""));
  contactSheet.appendRow(HEADERS.Contacts.map((header) => partnerContact[header] || ""));

  const rows = loadAdminList(payload.adminKey).rows;
  return { ok: true, row: rows.find((row) => row.householdId === householdId), created: rows.find((row) => row.householdId === createdId) };
}

function writeRecord(sheet, rowNumber, headers, record) { sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((header) => record[header] === undefined ? "" : record[header])]); }
function uniqueHouseholdId(value, existingIds) { const base = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest"; let candidate = base, suffix = 2; while (existingIds.indexOf(candidate) !== -1) candidate = `${base}-${suffix++}`; return candidate; }
function requireAdmin(adminKey) { const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY"); if (!expected) throw new Error("ADMIN_KEY script property is not set."); if (String(adminKey || "") !== expected) throw new Error("Invalid admin key."); }

function findInviteByToken(token) {
  const cleanToken = clean(token); if (!cleanToken) return null;
  ensureInviteTokens();
  const invite = readSheet(SHEETS.invitees).find((row) => row.primaryInviteToken === cleanToken || row.inviteToken === cleanToken || row.partnerInviteToken === cleanToken);
  if (!invite) return null;
  return { invite, role: invite.partnerInviteToken === cleanToken ? "partner" : "primary" };
}

function findLastResponseByHousehold(householdId, invite) {
  const rows = readSheet(SHEETS.responses);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.householdId !== householdId) continue;
    const responderRole = invite && invite.partnerInviteToken === clean(row.inviteToken) ? "partner" : "primary";
    return {
      status: row.status,
      partnerComing: row.partnerComing === true || row.partnerComing === "true",
      submittedAt: row.submittedAt,
      responderRole,
      responderName: responderRole === "partner" ? invite.partnerName || "Guest" : invite.primaryName || "Guest",
    };
  }
  return null;
}
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