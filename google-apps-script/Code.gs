const SHEETS = {
  invitees: "Invitees",
  contacts: "Contacts",
  responses: "Responses",
};

const HEADERS = {
  Invitees: ["householdId", "householdLabel", "primaryName", "partnerName", "inviteToken", "contactStatus"],
  Contacts: [
    "householdId",
    "email",
    "phone",
    "dm",
    "contactPreference",
    "contactSource",
    "contactStatus",
    "detailsConfirmed",
    "householdType",
    "shareMethod",
    "shareStatus",
    "lastSharedAt",
    "lastEditedBy",
    "suggestion",
  ],
  Responses: ["submittedAt", "householdId", "inviteToken", "status", "partnerComing", "partnerNameOverride", "email", "phone", "dm", "note"],
};

function doGet(e) {
  try {
    const action = String(e.parameter.action || "");
    if (action === "invite") return json(loadInvite(e.parameter.token));
    if (action === "adminList") return json(loadAdminList(e.parameter.adminKey));
    return json({ ok: false, error: "Unknown action." });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.action === "submitRsvp") return json(submitRsvp(payload));
    if (payload.action === "updateContact") return json(updateContact(payload));
    return json({ ok: false, error: "Unknown action." });
  } catch (error) {
    return json({ ok: false, error: String(error.message || error) });
  }
}

function setupSheets() {
  const spreadsheet = getSpreadsheet();
  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    const headers = HEADERS[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });
}

function loadInvite(token) {
  const invite = findInviteByToken(token);
  if (!invite) return { ok: false, error: "Invite link not found." };
  return {
    ok: true,
    invite: {
      householdId: invite.householdId,
      householdLabel: invite.householdLabel,
      primaryName: invite.primaryName,
      partnerName: invite.partnerName,
      lastResponse: findLastResponse(invite.inviteToken),
    },
  };
}

function submitRsvp(payload) {
  const status = String(payload.status || "").toLowerCase();
  if (["yes", "maybe", "no"].indexOf(status) === -1) {
    return { ok: false, error: "Choose yes, maybe, or no." };
  }

  const invite = findInviteByToken(payload.token);
  if (!invite) return { ok: false, error: "Invite link not found." };

  const sheet = getSheet(SHEETS.responses);
  sheet.appendRow([
    new Date().toISOString(),
    invite.householdId,
    invite.inviteToken,
    status,
    Boolean(payload.partnerComing),
    clean(payload.partnerNameOverride),
    clean(payload.email),
    clean(payload.phone),
    clean(payload.dm),
    clean(payload.note),
  ]);

  return { ok: true, message: "RSVP saved." };
}

function loadAdminList(adminKey) {
  requireAdmin(adminKey);
  const invitees = readSheet(SHEETS.invitees);
  const contactsById = objectBy(readSheet(SHEETS.contacts), "householdId");
  const latestResponses = latestResponsesByHousehold();
  return {
    ok: true,
    rows: invitees.map((invite) => {
      const contact = contactsById[invite.householdId] || {};
      const response = latestResponses[invite.householdId] || null;
      return {
        householdId: invite.householdId,
        householdLabel: invite.householdLabel,
        primaryName: invite.primaryName,
        partnerName: invite.partnerName,
        inviteToken: invite.inviteToken,
        email: contact.email || "",
        phone: contact.phone || "",
        dm: contact.dm || "",
        contactPreference: contact.contactPreference || "",
        contactSource: contact.contactSource || "",
        contactStatus: contact.contactStatus || invite.contactStatus || "needs contact",
        detailsConfirmed: contact.detailsConfirmed === true || contact.detailsConfirmed === "true",
        householdType: contact.householdType || (invite.partnerName ? "couple" : "single"),
        shareMethod: contact.shareMethod || contact.contactPreference || "",
        shareStatus: contact.shareStatus || "not shared",
        lastSharedAt: contact.lastSharedAt || "",
        rsvpStatus: response ? response.status : "waiting",
        lastRespondedAt: response ? response.submittedAt : "",
        suggestion: contact.suggestion || "",
      };
    }),
  };
}

function updateContact(payload) {
  requireAdmin(payload.adminKey);
  const householdId = clean(payload.householdId);
  if (!householdId) return { ok: false, error: "Missing household." };

  const sheet = getSheet(SHEETS.contacts);
  const rows = readSheet(SHEETS.contacts);
  const index = rows.findIndex((row) => row.householdId === householdId);
  const previous = index >= 0 ? rows[index] : {};
  const next = {
    householdId,
    email: clean(payload.email),
    phone: clean(payload.phone),
    dm: clean(payload.dm),
    contactPreference: clean(payload.contactPreference),
    contactSource: clean(payload.contactSource),
    contactStatus: clean(payload.contactStatus) || "needs contact",
    detailsConfirmed: Boolean(payload.detailsConfirmed),
    householdType: clean(payload.householdType) || "unknown",
    shareMethod: clean(payload.shareMethod),
    shareStatus: clean(payload.shareStatus) || "not shared",
    lastSharedAt: clean(payload.lastSharedAt),
    lastEditedBy: clean(payload.helperName),
    suggestion: previous.suggestion || "",
  };

  const values = HEADERS.Contacts.map((header) => next[header] || "");
  if (index >= 0) {
    sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  return { ok: true, row: next };
}

function requireAdmin(adminKey) {
  const expected = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!expected) throw new Error("ADMIN_KEY script property is not set.");
  if (String(adminKey || "") !== expected) throw new Error("Invalid admin key.");
}

function findInviteByToken(token) {
  const cleanToken = clean(token);
  if (!cleanToken) return null;
  return readSheet(SHEETS.invitees).find((row) => row.inviteToken === cleanToken) || null;
}

function findLastResponse(token) {
  const rows = readSheet(SHEETS.responses);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row.inviteToken === token) {
      return {
        status: row.status,
        partnerComing: row.partnerComing === true || row.partnerComing === "true",
        submittedAt: row.submittedAt,
      };
    }
  }
  return null;
}

function latestResponsesByHousehold() {
  const output = {};
  readSheet(SHEETS.responses).forEach((row) => {
    if (row.householdId) output[row.householdId] = row;
  });
  return output;
}

function readSheet(name) {
  const sheet = getSheet(name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function getSpreadsheet() {
  const sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (sheetId) return SpreadsheetApp.openById(sheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function objectBy(rows, key) {
  const output = {};
  rows.forEach((row) => {
    output[row[key]] = row;
  });
  return output;
}

function clean(value) {
  return String(value || "").trim();
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}