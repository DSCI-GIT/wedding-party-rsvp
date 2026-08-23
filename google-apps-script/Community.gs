/* Community features. Add this as a second Apps Script file named Community. */
const CHAT_LIMIT = 180;
const CHAT_INTERVAL_SECONDS = 4;

function loadCommunity(token) {
  const found = findInviteByToken(token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const invite = found.invite;
  const profile = getGuestProfile(clean(token), invite);
  if (!householdHasRsvp(invite.householdId)) return { ok: true, community: { unlocked: false, profile, topic: "Sunyoung & Eric - October 30", announcements: [], messages: [] } };
  const announcements = readSheet(SHEETS.announcements).filter((row) => truthy(row.published)).map(toAnnouncement).sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(right.publishedAt).localeCompare(String(left.publishedAt)));
  const messages = readSheet(SHEETS.chatMessages).filter((row) => truthy(row.visible) && !truthy(row.deleted)).map(toChatMessage).sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(left.createdAt).localeCompare(String(right.createdAt))).slice(-CHAT_LIMIT);
  return { ok: true, community: { unlocked: true, profile, topic: communityTopic(announcements), announcements, messages } };
}

function loadAdminCommunity(adminKey) {
  requireAdmin(adminKey);
  const announcements = readSheet(SHEETS.announcements).map(toAnnouncement).sort((left, right) => Number(right.pinned) - Number(left.pinned) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const messages = readSheet(SHEETS.chatMessages).slice().reverse().map(toChatMessage);
  const campaigns = readSheet(SHEETS.campaigns).slice().reverse().map(toCampaign);
  const recipients = readSheet(SHEETS.campaignRecipients).slice().reverse().map(toCampaignRecipient);
  const community = { announcements, messages, campaigns, recipients };
  if (demoMode()) community.personas = demoPersonas();
  return { ok: true, community };
}

function setUsername(payload) {
  const found = findInviteByToken(payload.token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const displayName = cleanDisplayName(payload.displayName);
  if (!displayName) return { ok: false, error: "Choose a display name." };
  return { ok: true, profile: saveGuestProfile(clean(payload.token), found.invite.householdId, { displayName }) };
}

function postMessage(payload) {
  const found = findInviteByToken(payload.token);
  if (!found) return { ok: false, error: "Invite link not found." };
  const token = clean(payload.token), invite = found.invite;
  if (!householdHasRsvp(invite.householdId)) return { ok: false, error: "RSVP first to join the party chat." };
  const profile = getGuestProfile(token, invite);
  if (profile.mutedUntil && Date.parse(profile.mutedUntil) > Date.now()) return { ok: false, error: "Wedding Mod Bot has put this handle on a short timeout." };
  const cache = CacheService.getScriptCache(), cacheKey = "chat:" + token;
  if (cache.get(cacheKey)) return { ok: false, error: "One moment between messages, please." };
  const raw = cleanPlainText(payload.body, 500);
  if (!raw) return { ok: false, error: "Write a message first." };
  cache.put(cacheKey, "1", CHAT_INTERVAL_SECONDS);
  const lower = raw.toLowerCase();
  if (lower === "/rsvp") return { ok: true, openRsvp: true, botMessage: botMessage("RSVP editor opened. Choose your answer at the top, then come back for the party line.") };
  if (lower === "/help") return { ok: true, botMessage: botMessage("Commands: /me, /rsvp, /topic, /shrug, /help. Keep it kind; this is a wedding, not a flame war.") };
  if (lower === "/topic") return { ok: true, botMessage: botMessage("Topic: " + communityTopic(readSheet(SHEETS.announcements).filter((row) => truthy(row.published)).map(toAnnouncement))) };
  let kind = "chat", body = raw;
  if (lower.indexOf("/me ") === 0) { kind = "action"; body = cleanPlainText(raw.slice(4), 460); }
  if (lower === "/shrug") { kind = "action"; body = "shrugs dramatically"; }
  if (raw.charAt(0) === "/" && kind === "chat") return { ok: true, botMessage: botMessage("Unknown command. Try /help before inventing a new protocol.") };
  if (!body) return { ok: false, error: "That command needs a little text." };
  const message = appendChatMessage({ token, householdId: invite.householdId, displayName: profile.displayName, body, kind, visible: true, deleted: false, pinned: false });
  const reaction = deterministicReaction(body);
  const bot = reaction ? appendChatMessage({ token: "", householdId: "", displayName: "Wedding Mod Bot", body: reaction, kind: "bot", visible: true, deleted: false, pinned: false }) : null;
  return { ok: true, message, botMessage: bot };
}

function saveAnnouncement(payload) {
  requireAdmin(payload.adminKey);
  const title = cleanPlainText(payload.title, 120), body = cleanPlainText(payload.body, 2000);
  if (!title || !body) return { ok: false, error: "An announcement needs a title and a message." };
  const sheet = getSheet(SHEETS.announcements), rows = readSheet(SHEETS.announcements), index = rows.findIndex((row) => row.id === clean(payload.id)), now = new Date().toISOString();
  const record = { ...(index >= 0 ? rows[index] : {}), id: index >= 0 ? rows[index].id : Utilities.getUuid(), title, body, photoUrl: clean(payload.photoUrl), pinned: Boolean(payload.pinned), published: Boolean(payload.published), publishedAt: Boolean(payload.published) ? (index >= 0 && rows[index].publishedAt ? rows[index].publishedAt : now) : "", createdAt: index >= 0 ? rows[index].createdAt : now, createdBy: clean(payload.helperName) || "Admin" };
  if (index >= 0) writeRecord(sheet, index + 2, HEADERS.Announcements, record); else sheet.appendRow(HEADERS.Announcements.map((header) => record[header] || ""));
  return { ok: true, announcement: toAnnouncement(record) };
}

function moderateMessage(payload) {
  requireAdmin(payload.adminKey);
  const sheet = getSheet(SHEETS.chatMessages), rows = readSheet(SHEETS.chatMessages), index = rows.findIndex((row) => row.id === clean(payload.messageId));
  if (index < 0) return { ok: false, error: "Message not found." };
  const record = { ...rows[index] }, action = clean(payload.actionType);
  if (action === "hide") record.visible = false;
  else if (action === "restore") { record.visible = true; record.deleted = false; }
  else if (action === "delete") { record.visible = false; record.deleted = true; }
  else if (action === "pin") record.pinned = !truthy(record.pinned);
  else if (action === "mute") { const target = clean(payload.muteToken) || clean(record.token), found = findInviteByToken(target); if (found) saveGuestProfile(target, found.invite.householdId, { mutedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() }); }
  else return { ok: false, error: "Unknown moderation action." };
  writeRecord(sheet, index + 2, HEADERS.ChatMessages, record);
  return { ok: true, message: toChatMessage(record) };
}

function createCampaign(payload) {
  requireAdmin(payload.adminKey);
  const title = cleanPlainText(payload.title, 120), subject = cleanPlainText(payload.subject, 180), body = cleanPlainText(payload.body, 4000), tokens = Array.from(new Set((payload.recipientTokens || []).map(clean).filter(Boolean)));
  if (!title || !subject || !body) return { ok: false, error: "Campaign title, email subject, and message are required." };
  if (!tokens.length) return { ok: false, error: "Choose at least one recipient." };
  const contacts = objectBy(readSheet(SHEETS.contacts), "householdId"), recipients = tokens.map((token) => campaignRecipientForToken(token, contacts)).filter(Boolean);
  if (!recipients.length) return { ok: false, error: "No valid invitees were selected." };
  const campaign = { id: Utilities.getUuid(), title, subject, body, createdAt: new Date().toISOString(), createdBy: clean(payload.helperName) || "Admin", recipientCount: recipients.length, emailSentCount: 0, sharedCount: 0 };
  getSheet(SHEETS.campaigns).appendRow(HEADERS.Campaigns.map((header) => campaign[header] || ""));
  const sheet = getSheet(SHEETS.campaignRecipients);
  recipients.forEach((recipient) => { recipient.campaignId = campaign.id; sheet.appendRow(HEADERS.CampaignRecipients.map((header) => recipient[header] || "")); });
  return { ok: true, campaign: toCampaign(campaign), recipients: recipients.map(toCampaignRecipient) };
}

function sendCampaignEmails(payload) {
  requireAdmin(payload.adminKey);
  const campaignId = clean(payload.campaignId), campaigns = readSheet(SHEETS.campaigns), campaignIndex = campaigns.findIndex((row) => row.id === campaignId);
  if (campaignIndex < 0) return { ok: false, error: "Campaign not found." };
  const campaign = campaigns[campaignIndex], recipientSheet = getSheet(SHEETS.campaignRecipients), recipients = readSheet(SHEETS.campaignRecipients), siteUrl = scriptProperty("SITE_URL");
  let sent = 0;
  recipients.forEach((recipient, index) => {
    if (recipient.campaignId !== campaignId || !clean(recipient.email) || recipient.emailStatus === "sent") return;
    const link = siteUrl ? siteUrl.replace(/#.*$/, "") + "#invite=" + encodeURIComponent(recipient.token) : "";
    const message = String(campaign.body || "").replace(/\{name\}/g, recipient.name).replace(/\{invite\}/g, link), next = { ...recipient };
    try { if (!demoMode()) MailApp.sendEmail({ to: recipient.email, subject: campaign.subject, body: message }); next.emailStatus = "sent"; next.emailSentAt = new Date().toISOString(); sent += 1; } catch (error) { next.emailStatus = "failed"; }
    writeRecord(recipientSheet, index + 2, HEADERS.CampaignRecipients, next);
  });
  const sentTotal = readSheet(SHEETS.campaignRecipients).filter((row) => row.campaignId === campaignId && row.emailStatus === "sent").length;
  writeRecord(getSheet(SHEETS.campaigns), campaignIndex + 2, HEADERS.Campaigns, { ...campaign, emailSentCount: sentTotal });
  return { ok: true, sent, simulated: demoMode() };
}

function recordCampaignShare(payload) {
  requireAdmin(payload.adminKey);
  const sheet = getSheet(SHEETS.campaignRecipients), rows = readSheet(SHEETS.campaignRecipients), index = rows.findIndex((row) => row.campaignId === clean(payload.campaignId) && row.token === clean(payload.token));
  if (index < 0) return { ok: false, error: "Campaign recipient not found." };
  const record = { ...rows[index], shareStatus: "shared", sharedAt: new Date().toISOString() };
  writeRecord(sheet, index + 2, HEADERS.CampaignRecipients, record);
  const campaigns = readSheet(SHEETS.campaigns), campaignIndex = campaigns.findIndex((row) => row.id === clean(payload.campaignId));
  if (campaignIndex >= 0) { const next = { ...campaigns[campaignIndex], sharedCount: readSheet(SHEETS.campaignRecipients).filter((row) => row.campaignId === clean(payload.campaignId) && row.shareStatus === "shared").length }; writeRecord(getSheet(SHEETS.campaigns), campaignIndex + 2, HEADERS.Campaigns, next); }
  return { ok: true, recipient: toCampaignRecipient(record) };
}

function uploadAnnouncementPhoto(payload) {
  requireAdmin(payload.adminKey);
  const data = clean(payload.data), match = data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[2].length > 8 * 1024 * 1024) return { ok: false, error: "Choose an image smaller than 6 MB." };
  const mimeType = clean(payload.mimeType) || match[1] || "image/jpeg";
  if (mimeType.indexOf("image/") !== 0) return { ok: false, error: "Only image uploads are allowed." };
  let folderId = scriptProperty("MEDIA_FOLDER_ID"), folder;
  if (folderId) folder = DriveApp.getFolderById(folderId); else { folder = DriveApp.createFolder("Wedding party RSVP media"); PropertiesService.getScriptProperties().setProperty("MEDIA_FOLDER_ID", folder.getId()); }
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(match[2]), mimeType, safeFileName(payload.name)));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, photoUrl: "https://drive.google.com/uc?export=view&id=" + file.getId() };
}

function resetDemoData(payload) { requireAdmin(payload.adminKey); if (!demoMode()) return { ok: false, error: "Demo reset is unavailable in production." }; seedDemoData(); return { ok: true, reset: true }; }
function getGuestProfile(token, invite) { const row = readSheet(SHEETS.guestProfiles).find((item) => item.token === token); return { displayName: row && row.displayName || defaultDisplayName(invite, token), mutedUntil: row && row.mutedUntil || "" }; }
function saveGuestProfile(token, householdId, changes) { const sheet = getSheet(SHEETS.guestProfiles), rows = readSheet(SHEETS.guestProfiles), index = rows.findIndex((row) => row.token === token), record = { ...(index >= 0 ? rows[index] : {}), token, householdId, displayName: changes.displayName || (index >= 0 ? rows[index].displayName : ""), mutedUntil: changes.mutedUntil === undefined ? (index >= 0 ? rows[index].mutedUntil : "") : changes.mutedUntil, updatedAt: new Date().toISOString() }; if (!record.displayName) { const found = findInviteByToken(token); record.displayName = defaultDisplayName(found && found.invite, token); } if (index >= 0) writeRecord(sheet, index + 2, HEADERS.GuestProfiles, record); else sheet.appendRow(HEADERS.GuestProfiles.map((header) => record[header] || "")); return { displayName: record.displayName, mutedUntil: record.mutedUntil || "" }; }
function campaignRecipientForToken(token, contacts) { const found = findInviteByToken(token); if (!found) return null; const contact = contacts[found.invite.householdId] || {}, partner = found.role === "partner"; return { id: Utilities.getUuid(), campaignId: "", householdId: found.invite.householdId, token, name: partner ? found.invite.partnerName || "Guest" : found.invite.primaryName || "Guest", email: partner ? contact.partnerEmail || "" : contact.primaryEmail || contact.email || "", phone: partner ? contact.partnerPhone || "" : contact.primaryPhone || contact.phone || "", dm: partner ? contact.partnerDm || "" : contact.primaryDm || contact.dm || "", emailStatus: "not sent", emailSentAt: "", shareStatus: "not shared", sharedAt: "" }; }
function appendChatMessage(record) { const next = { id: Utilities.getUuid(), createdAt: new Date().toISOString(), ...record }; getSheet(SHEETS.chatMessages).appendRow(HEADERS.ChatMessages.map((header) => next[header] === undefined ? "" : next[header])); return toChatMessage(next); }
function botMessage(body) { return { id: "bot-" + Utilities.getUuid(), displayName: "Wedding Mod Bot", body, kind: "bot", createdAt: new Date().toISOString(), visible: true, pinned: false }; }
function deterministicReaction(body) { const value = body.split("").reduce((total, character) => total + character.charCodeAt(0), 0), reactions = ["Wedding Mod Bot logged that. The spreadsheet remains suspiciously calm.", "A perfectly respectable message. Carry on.", "The dance floor has been notified.", "Somewhere, a venue capacity estimate just nodded solemnly."]; return value % 5 === 0 ? reactions[value % reactions.length] : ""; }
function toAnnouncement(row) { return { id: row.id, title: row.title, body: row.body, photoUrl: row.photoUrl || "", pinned: truthy(row.pinned), publishedAt: row.publishedAt || "", createdAt: row.createdAt || "", createdBy: row.createdBy || "Admin" }; }
function toChatMessage(row) { return { id: row.id, token: row.token, householdId: row.householdId, displayName: row.displayName || "Guest", body: row.body, kind: row.kind || "chat", createdAt: row.createdAt, visible: truthy(row.visible), pinned: truthy(row.pinned), deleted: truthy(row.deleted) }; }
function toCampaign(row) { return { id: row.id, title: row.title, subject: row.subject, body: row.body, createdAt: row.createdAt, createdBy: row.createdBy, recipientCount: Number(row.recipientCount || 0), emailSentCount: Number(row.emailSentCount || 0), sharedCount: Number(row.sharedCount || 0) }; }
function toCampaignRecipient(row) { return { id: row.id, campaignId: row.campaignId, householdId: row.householdId, token: row.token, name: row.name, email: row.email || "", phone: row.phone || "", dm: row.dm || "", emailStatus: row.emailStatus || "not sent", emailSentAt: row.emailSentAt || "", shareStatus: row.shareStatus || "not shared", sharedAt: row.sharedAt || "" }; }
function householdHasRsvp(householdId) { return readSheet(SHEETS.responses).some((row) => row.householdId === householdId); }
function defaultDisplayName(invite, token) { if (!invite) return "Guest"; const found = findInviteByToken(token), fullName = found && found.role === "partner" ? invite.partnerName : invite.primaryName, words = clean(fullName).split(/\s+/); return words.length > 1 ? words[0] + " " + words[words.length - 1].charAt(0) + "." : words[0] || "Guest"; }
function communityTopic(announcements) { const pinned = (announcements || []).find((announcement) => announcement.pinned); return pinned ? pinned.title : "October 30 - Hamilton area"; }
function cleanPlainText(value, max) { return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").slice(0, max); }
function cleanDisplayName(value) { return cleanPlainText(value, 40).replace(/[^A-Za-z0-9 ._-]/g, ""); }
function safeFileName(value) { return clean(value).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) || "announcement-image"; }
function truthy(value) { return value === true || String(value).toLowerCase() === "true"; }
function scriptProperty(key) { return PropertiesService.getScriptProperties().getProperty(key) || ""; }
function demoMode() { return scriptProperty("DEMO_MODE") === "true"; }
function demoPersonas() { const people = []; readSheet(SHEETS.invitees).forEach((invite) => { if (invite.primaryInviteToken || invite.inviteToken) people.push({ name: invite.primaryName, token: invite.primaryInviteToken || invite.inviteToken }); if (invite.partnerName && invite.partnerInviteToken) people.push({ name: invite.partnerName, token: invite.partnerInviteToken }); }); return people; }