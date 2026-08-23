export type RsvpStatus = "yes" | "maybe" | "no";
export type ShareMethod = "text" | "email" | "dm" | "copy" | "";
export type HouseholdType = "couple" | "single" | "unknown";
export type ViewerRole = "primary" | "partner";

export type LastResponse = {
  status: RsvpStatus;
  partnerComing: boolean;
  submittedAt: string;
  responderRole: ViewerRole;
  responderName: string;
};

export type AdminResponse = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
  responderRole: ViewerRole;
  responderName: string;
  status: RsvpStatus;
  partnerComing: boolean;
  submittedAt: string;
  note: string;
};

export type Invite = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
  viewerRole: ViewerRole;
  email: string;
  phone: string;
  dm: string;
  lastResponse?: LastResponse;
  partnerAnsweredForViewer: boolean;
  partnerResponderName: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  photoUrl: string;
  pinned: boolean;
  publishedAt: string;
  createdAt?: string;
  createdBy: string;
};

export type ChatMessage = {
  id: string;
  displayName: string;
  body: string;
  kind: "chat" | "action" | "bot";
  createdAt: string;
  householdId?: string;
  token?: string;
  visible?: boolean;
  pinned?: boolean;
  deleted?: boolean;
};

export type Community = {
  unlocked: boolean;
  profile: { displayName: string; mutedUntil: string };
  topic: string;
  announcements: Announcement[];
  messages: ChatMessage[];
};

export type Campaign = {
  id: string;
  title: string;
  subject: string;
  body: string;
  createdAt: string;
  createdBy: string;
  recipientCount: number;
  emailSentCount: number;
  sharedCount: number;
};

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  householdId: string;
  token: string;
  name: string;
  email: string;
  phone: string;
  dm: string;
  emailStatus: string;
  emailSentAt: string;
  shareStatus: string;
  sharedAt: string;
};

export type AdminCommunity = {
  announcements: Announcement[];
  messages: ChatMessage[];
  campaigns: Campaign[];
  recipients: CampaignRecipient[];
  personas?: Array<{ name: string; token: string }>;
};

export type ContactRow = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
  inviteToken: string;
  primaryInviteToken: string;
  partnerInviteToken: string;
  email: string;
  phone: string;
  dm: string;
  contactPreference: string;
  contactSource: string;
  contactStatus: string;
  detailsConfirmed: boolean;
  householdType: HouseholdType;
  shareMethod: ShareMethod;
  shareStatus: string;
  lastSharedAt: string;
  rsvpStatus: "waiting" | RsvpStatus;
  lastRespondedAt: string;
  primaryEmail: string;
  primaryPhone: string;
  primaryDm: string;
  primaryContactPreference: string;
  primaryContactSource: string;
  primaryContacted: boolean;
  primaryLastContactedAt: string;
  partnerEmail: string;
  partnerPhone: string;
  partnerDm: string;
  partnerContactPreference: string;
  partnerContactSource: string;
  partnerContacted: boolean;
  partnerLastContactedAt: string;
  suggestion: string;
};

type ApiResult<T> = { ok: true } & T;
type ApiError = { ok: false; error: string };

const API_URL = import.meta.env.VITE_RSVP_API_URL as string | undefined;

const demoInvite: Invite = {
  householdId: "demo-sunyoung-eric", householdLabel: "Sunyoung & Eric", primaryName: "Sunyoung", partnerName: "Eric", viewerRole: "primary", email: "", phone: "", dm: "", partnerAnsweredForViewer: false, partnerResponderName: "",
};

const demoContacts: ContactRow[] = [
  normalizeContactRow({ householdId: "demo-nova-jamie", householdLabel: "Nova & Jamie", primaryName: "Nova Arden", partnerName: "Jamie Vale", inviteToken: "demo-nova-arden", primaryInviteToken: "demo-nova-arden", partnerInviteToken: "demo-jamie-vale", contactPreference: "email", contactSource: "Demo seed", contactStatus: "confirmed", detailsConfirmed: true, householdType: "couple", shareMethod: "email", shareStatus: "shared", lastSharedAt: "", rsvpStatus: "yes", lastRespondedAt: "", primaryEmail: "nova@example.test", primaryContacted: true, partnerEmail: "jamie@example.test", partnerContacted: true, suggestion: "Invented demo household." }),
  normalizeContactRow({ householdId: "demo-mira", householdLabel: "Mira Ellis", primaryName: "Mira Ellis", partnerName: "", inviteToken: "demo-mira-ellis", primaryInviteToken: "demo-mira-ellis", contactPreference: "text", contactSource: "Demo seed", contactStatus: "confirmed", detailsConfirmed: true, householdType: "single", shareMethod: "text", shareStatus: "shared", lastSharedAt: "", rsvpStatus: "maybe", lastRespondedAt: "", primaryEmail: "mira@example.test", primaryContacted: true, suggestion: "Invented demo guest." }),
];
let demoRsvped = false;
let demoProfile = { displayName: "Nova A.", mutedUntil: "" };
let demoAnnouncements: Announcement[] = [{ id: "demo-update", title: "The demo party line is open", body: "This is made-up sample data. It is safe to post, moderate, reset, and share inside the demo.", photoUrl: "", pinned: true, publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), createdBy: "Demo Host" }];
let demoMessages: ChatMessage[] = [{ id: "demo-chat-1", token: "demo-nova-arden", householdId: "demo-nova-jamie", displayName: "Nova A.", body: "Testing the party line. It has excellent imaginary snacks.", kind: "chat", createdAt: new Date().toISOString(), visible: true, pinned: false }, { id: "demo-chat-2", displayName: "Wedding Mod Bot", body: "Demo data loaded. Please do not feed the spreadsheet after midnight.", kind: "bot", createdAt: new Date().toISOString(), visible: true, pinned: false }];
let demoCampaigns: Campaign[] = [];
let demoRecipients: CampaignRecipient[] = [];
function demoId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function resetDemoState() { demoRsvped = false; demoProfile = { displayName: "Nova A.", mutedUntil: "" }; demoAnnouncements = [{ id: "demo-update", title: "The demo party line is open", body: "This is made-up sample data. It is safe to post, moderate, reset, and share inside the demo.", photoUrl: "", pinned: true, publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), createdBy: "Demo Host" }]; demoMessages = [{ id: "demo-chat-1", token: "demo-nova-arden", householdId: "demo-nova-jamie", displayName: "Nova A.", body: "Testing the party line. It has excellent imaginary snacks.", kind: "chat", createdAt: new Date().toISOString(), visible: true, pinned: false }]; demoCampaigns = []; demoRecipients = []; }

export async function fetchInvite(token: string): Promise<ApiResult<{ invite: Invite }> | ApiError> {
  if (!API_URL) {
    if (!token.startsWith("demo")) return { ok: false, error: "This invite link is missing or not connected yet." };
    const invite = { ...demoInvite, householdLabel: token === "demo-mira-ellis" ? "Mira Ellis" : "Nova & Jamie", primaryName: token === "demo-mira-ellis" ? "Mira" : token === "demo-jamie-vale" ? "Jamie" : "Nova", partnerName: token === "demo-mira-ellis" ? "" : token === "demo-jamie-vale" ? "Nova" : "Jamie", viewerRole: token === "demo-jamie-vale" ? "partner" as const : "primary" as const, lastResponse: demoRsvped ? { status: "yes" as const, partnerComing: token !== "demo-mira-ellis", submittedAt: new Date().toISOString(), responderRole: "primary" as const, responderName: "Nova" } : undefined };
    return { ok: true, invite };
  }
  return getJson({ action: "invite", token });
}

export async function submitRsvp(payload: { token: string; status: RsvpStatus; partnerComing: boolean; partnerNameOverride: string; email: string; phone: string; dm: string; note: string }): Promise<ApiResult<{ message: string }> | ApiError> {
  if (!API_URL) { demoRsvped = true; return { ok: true, message: "Demo RSVP saved." }; }
  return postJson({ action: "submitRsvp", ...payload });
}

export async function fetchCommunity(token: string): Promise<ApiResult<{ community: Community }> | ApiError> {
  if (!API_URL) return { ok: true, community: { unlocked: demoRsvped, profile: demoProfile, topic: demoAnnouncements.find((item) => item.pinned)?.title || "October 30, Hamilton", announcements: demoRsvped ? demoAnnouncements : [], messages: demoRsvped ? demoMessages : [] } };
  return getJson({ action: "community", token });
}

export function setCommunityUsername(token: string, displayName: string) { if (!API_URL) { demoProfile = { ...demoProfile, displayName: displayName.trim().slice(0, 40) || demoProfile.displayName }; return Promise.resolve({ ok: true as const, profile: demoProfile }); } return postJson<{ profile: Community["profile"] }>({ action: "setUsername", token, displayName }); }
export function postChatMessage(token: string, body: string): Promise<ApiResult<{ message?: ChatMessage; botMessage?: ChatMessage; openRsvp?: boolean }> | ApiError> { if (!API_URL) { if (!demoRsvped) return Promise.resolve({ ok: false as const, error: "RSVP first to join the party chat." }); if (body.trim() === "/rsvp") return Promise.resolve({ ok: true as const, openRsvp: true }); const message: ChatMessage = { id: demoId("message"), token, displayName: demoProfile.displayName, body: body.trim() === "/shrug" ? "shrugs dramatically" : body.trim().replace(/^\/me\s+/, ""), kind: body.trim().startsWith("/me ") || body.trim() === "/shrug" ? "action" : "chat", createdAt: new Date().toISOString(), visible: true, pinned: false }; demoMessages = [...demoMessages, message]; return Promise.resolve({ ok: true as const, message }); } return postJson<{ message?: ChatMessage; botMessage?: ChatMessage; openRsvp?: boolean }>({ action: "postMessage", token, body }); }

export async function fetchContactRows(adminKey: string): Promise<ApiResult<{ rows: ContactRow[] }> | ApiError> {
  if (!API_URL) return adminKey === "demo-admin" ? { ok: true, rows: demoContacts } : { ok: false, error: "Enter the admin key to load contact rows." };
  const result = await getJson<{ rows: ContactRow[] }>({ action: "adminList", adminKey });
  return result.ok ? { ok: true, rows: result.rows.map(normalizeContactRow) } : result;
}

export function fetchResponses(adminKey: string) { return API_URL ? getJson<{ responses: AdminResponse[] }>({ action: "adminResponses", adminKey }) : Promise.resolve({ ok: true as const, responses: [] }); }
export function backfillRsvpContacts(adminKey: string) { return API_URL ? postJson<{ updated: number }>({ action: "backfillRsvpContacts", adminKey }) : Promise.resolve({ ok: true as const, updated: 0 }); }
export function fetchAdminCommunity(adminKey: string) { if (!API_URL) return Promise.resolve(adminKey === "demo-admin" ? { ok: true as const, community: { announcements: demoAnnouncements, messages: demoMessages, campaigns: demoCampaigns, recipients: demoRecipients, personas: [{ name: "Nova Arden", token: "demo-nova-arden" }, { name: "Jamie Vale", token: "demo-jamie-vale" }, { name: "Mira Ellis", token: "demo-mira-ellis" }] } } : { ok: false as const, error: "Enter demo-admin to load the demo." }); return getJson<{ community: AdminCommunity }>({ action: "adminCommunity", adminKey }); }
export function saveAnnouncement(payload: { adminKey: string; helperName: string; id?: string; title: string; body: string; photoUrl: string; pinned: boolean; published: boolean }) { if (!API_URL) { const announcement: Announcement = { id: demoId("announcement"), title: payload.title, body: payload.body, photoUrl: payload.photoUrl, pinned: payload.pinned, publishedAt: payload.published ? new Date().toISOString() : "", createdAt: new Date().toISOString(), createdBy: payload.helperName || "Demo Admin" }; demoAnnouncements = [announcement, ...demoAnnouncements]; return Promise.resolve({ ok: true as const, announcement }); } return postJson<{ announcement: Announcement }>({ action: "saveAnnouncement", ...payload }); }
export function moderateMessage(payload: { adminKey: string; messageId: string; actionType: "hide" | "restore" | "delete" | "pin" | "mute"; muteToken?: string }) { if (!API_URL) { demoMessages = demoMessages.map((message) => message.id !== payload.messageId ? message : { ...message, visible: payload.actionType === "hide" || payload.actionType === "delete" ? false : payload.actionType === "restore" ? true : message.visible, deleted: payload.actionType === "delete" ? true : message.deleted, pinned: payload.actionType === "pin" ? !message.pinned : message.pinned }); return Promise.resolve({ ok: true as const, message: demoMessages.find((message) => message.id === payload.messageId) }); } return postJson<{ message?: ChatMessage }>({ action: "moderateMessage", ...payload }); }
export function createCampaign(payload: { adminKey: string; helperName: string; title: string; subject: string; body: string; recipientTokens: string[]; siteUrl: string }) { if (!API_URL) { const campaign: Campaign = { id: demoId("campaign"), title: payload.title, subject: payload.subject, body: payload.body, createdAt: new Date().toISOString(), createdBy: payload.helperName || "Demo Admin", recipientCount: payload.recipientTokens.length, emailSentCount: 0, sharedCount: 0 }; const recipients = payload.recipientTokens.map((token) => ({ id: demoId("recipient"), campaignId: campaign.id, householdId: "demo", token, name: token.includes("jamie") ? "Jamie Vale" : token.includes("mira") ? "Mira Ellis" : "Nova Arden", email: "demo@example.test", phone: "555-0100", dm: "@demo", emailStatus: "not sent", emailSentAt: "", shareStatus: "not shared", sharedAt: "" })); demoCampaigns = [campaign, ...demoCampaigns]; demoRecipients = [...recipients, ...demoRecipients]; return Promise.resolve({ ok: true as const, campaign, recipients }); } return postJson<{ campaign: Campaign; recipients: CampaignRecipient[] }>({ action: "createCampaign", ...payload }); }
export function sendCampaignEmails(adminKey: string, campaignId: string) { if (!API_URL) { let sent = 0; demoRecipients = demoRecipients.map((recipient) => { if (recipient.campaignId !== campaignId || recipient.emailStatus === "sent") return recipient; sent += 1; return { ...recipient, emailStatus: "sent", emailSentAt: new Date().toISOString() }; }); demoCampaigns = demoCampaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, emailSentCount: campaign.emailSentCount + sent } : campaign); return Promise.resolve({ ok: true as const, sent, simulated: true }); } return postJson<{ sent: number; simulated: boolean }>({ action: "sendCampaignEmails", adminKey, campaignId }); }
export function deleteCampaign(adminKey: string, campaignId: string) { if (!API_URL) { demoCampaigns = demoCampaigns.filter((campaign) => campaign.id !== campaignId); demoRecipients = demoRecipients.filter((recipient) => recipient.campaignId !== campaignId); return Promise.resolve({ ok: true as const, deleted: true }); } return postJson<{ deleted: boolean }>({ action: "deleteCampaign", adminKey, campaignId }); }
export function recordCampaignShare(adminKey: string, campaignId: string, token: string) { if (!API_URL) { let saved: CampaignRecipient | undefined; demoRecipients = demoRecipients.map((recipient) => { if (recipient.campaignId !== campaignId || recipient.token !== token) return recipient; saved = { ...recipient, shareStatus: "shared", sharedAt: new Date().toISOString() }; return saved; }); return saved ? Promise.resolve({ ok: true as const, recipient: saved }) : Promise.resolve({ ok: false as const, error: "Demo recipient not found." }); } return postJson<{ recipient: CampaignRecipient }>({ action: "recordCampaignShare", adminKey, campaignId, token }); }
export function resetDemoData(adminKey: string) { if (!API_URL) { resetDemoState(); return Promise.resolve({ ok: true as const, reset: true }); } return postJson<{ reset: boolean }>({ action: "resetDemoData", adminKey }); }
export async function uploadAnnouncementPhoto(adminKey: string, file: File) {
  const data = await fileToDataUrl(file);
  if (!API_URL) return { ok: true as const, photoUrl: data };
  return postJson<{ photoUrl: string }>({ action: "uploadAnnouncementPhoto", adminKey, name: file.name, mimeType: file.type, data });
}

export function saveContactRow(payload: { adminKey: string; helperName: string; householdId: string; email: string; phone: string; dm: string; contactPreference: string; contactSource: string; contactStatus: string; detailsConfirmed: boolean; householdType: HouseholdType; shareMethod: ShareMethod; shareStatus: string; lastSharedAt: string; primaryEmail: string; primaryPhone: string; primaryDm: string; primaryContactPreference: string; primaryContactSource: string; primaryContacted: boolean; primaryLastContactedAt: string; partnerEmail: string; partnerPhone: string; partnerDm: string; partnerContactPreference: string; partnerContactSource: string; partnerContacted: boolean; partnerLastContactedAt: string }): Promise<ApiResult<{ row: ContactRow }> | ApiError> {
  if (!API_URL) return Promise.resolve({ ok: true, row: normalizeContactRow({ householdLabel: "", primaryName: "", partnerName: "", inviteToken: "demo", suggestion: "Demo save only.", rsvpStatus: "waiting", lastRespondedAt: "", ...payload }) });
  return postJson<{ row: ContactRow }>({ action: "updateContact", ...payload }).then((result) => result.ok ? { ...result, row: normalizeContactRow(result.row) } : result);
}

export function splitContactRow(payload: { adminKey: string; helperName: string; householdId: string }): Promise<ApiResult<{ row: ContactRow; created: ContactRow }> | ApiError> {
  if (!API_URL) return Promise.resolve({ ok: false, error: "Connect Apps Script to split a household." });
  return postJson<{ row: ContactRow; created: ContactRow }>({ action: "splitHousehold", ...payload }).then((result) => result.ok ? { ...result, row: normalizeContactRow(result.row), created: normalizeContactRow(result.created) } : result);
}

function normalizeContactRow(row: Partial<ContactRow>): ContactRow {
  const primaryEmail = row.primaryEmail ?? row.email ?? ""; const primaryPhone = row.primaryPhone ?? row.phone ?? ""; const primaryDm = row.primaryDm ?? row.dm ?? ""; const primaryContactPreference = row.primaryContactPreference ?? row.contactPreference ?? ""; const primaryContactSource = row.primaryContactSource ?? row.contactSource ?? "";
  return { householdId: row.householdId ?? "", householdLabel: row.householdLabel ?? "", primaryName: row.primaryName ?? "", partnerName: row.partnerName ?? "", inviteToken: row.inviteToken ?? "", primaryInviteToken: row.primaryInviteToken ?? row.inviteToken ?? "", partnerInviteToken: row.partnerInviteToken ?? "", email: row.email ?? primaryEmail, phone: row.phone ?? primaryPhone, dm: row.dm ?? primaryDm, contactPreference: row.contactPreference ?? primaryContactPreference, contactSource: row.contactSource ?? primaryContactSource, contactStatus: row.contactStatus ?? "needs contact", detailsConfirmed: Boolean(row.detailsConfirmed), householdType: row.householdType ?? "unknown", shareMethod: row.shareMethod ?? "", shareStatus: row.shareStatus ?? "not shared", lastSharedAt: row.lastSharedAt ?? "", rsvpStatus: row.rsvpStatus ?? "waiting", lastRespondedAt: row.lastRespondedAt ?? "", primaryEmail, primaryPhone, primaryDm, primaryContactPreference, primaryContactSource, primaryContacted: row.primaryContacted === true, primaryLastContactedAt: row.primaryLastContactedAt ?? "", partnerEmail: row.partnerEmail ?? "", partnerPhone: row.partnerPhone ?? "", partnerDm: row.partnerDm ?? "", partnerContactPreference: row.partnerContactPreference ?? "", partnerContactSource: row.partnerContactSource ?? "", partnerContacted: row.partnerContacted === true, partnerLastContactedAt: row.partnerLastContactedAt ?? "", suggestion: row.suggestion ?? "" };
}

async function getJson<T>(params: Record<string, string>): Promise<ApiResult<T> | ApiError> { const response = await fetch(`${API_URL}?${new URLSearchParams(params).toString()}`); return response.json(); }
async function postJson<T>(payload: Record<string, unknown>): Promise<ApiResult<T> | ApiError> { const response = await fetch(API_URL!, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }); return response.json(); }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }