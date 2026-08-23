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

const demoContacts: ContactRow[] = [normalizeContactRow({ householdId: "demo-sunyoung-eric", householdLabel: "Sunyoung & Eric", primaryName: "Sunyoung", partnerName: "Eric", inviteToken: "demo", contactPreference: "text", contactSource: "demo", contactStatus: "needs contact", detailsConfirmed: false, householdType: "couple", shareMethod: "text", shareStatus: "not shared", lastSharedAt: "", rsvpStatus: "waiting", lastRespondedAt: "", suggestion: "Demo mode." })];

export async function fetchInvite(token: string): Promise<ApiResult<{ invite: Invite }> | ApiError> {
  if (!API_URL) return token === "demo" ? { ok: true, invite: demoInvite } : { ok: false, error: "This invite link is missing or not connected yet." };
  return getJson({ action: "invite", token });
}

export async function submitRsvp(payload: { token: string; status: RsvpStatus; partnerComing: boolean; partnerNameOverride: string; email: string; phone: string; dm: string; note: string }): Promise<ApiResult<{ message: string }> | ApiError> {
  if (!API_URL) return { ok: true, message: "Demo RSVP saved locally for preview." };
  return postJson({ action: "submitRsvp", ...payload });
}

export async function fetchCommunity(token: string): Promise<ApiResult<{ community: Community }> | ApiError> {
  if (!API_URL) return { ok: true, community: { unlocked: true, profile: { displayName: "Sunyoung Y.", mutedUntil: "" }, topic: "October 30, Hamilton", announcements: [{ id: "demo", title: "The party is taking shape", body: "Music, dancing, food, and friends. More soon.", photoUrl: "", pinned: true, publishedAt: new Date().toISOString(), createdBy: "Wedding Mod Bot" }], messages: [] } };
  return getJson({ action: "community", token });
}

export function setCommunityUsername(token: string, displayName: string) { return postJson<{ profile: Community["profile"] }>({ action: "setUsername", token, displayName }); }
export function postChatMessage(token: string, body: string) { return postJson<{ message?: ChatMessage; botMessage?: ChatMessage; openRsvp?: boolean }>({ action: "postMessage", token, body }); }

export async function fetchContactRows(adminKey: string): Promise<ApiResult<{ rows: ContactRow[] }> | ApiError> {
  if (!API_URL) return adminKey === "demo-admin" ? { ok: true, rows: demoContacts } : { ok: false, error: "Enter the admin key to load contact rows." };
  const result = await getJson<{ rows: ContactRow[] }>({ action: "adminList", adminKey });
  return result.ok ? { ok: true, rows: result.rows.map(normalizeContactRow) } : result;
}

export function fetchResponses(adminKey: string) { return API_URL ? getJson<{ responses: AdminResponse[] }>({ action: "adminResponses", adminKey }) : Promise.resolve({ ok: true as const, responses: [] }); }
export function backfillRsvpContacts(adminKey: string) { return API_URL ? postJson<{ updated: number }>({ action: "backfillRsvpContacts", adminKey }) : Promise.resolve({ ok: true as const, updated: 0 }); }
export function fetchAdminCommunity(adminKey: string) { return API_URL ? getJson<{ community: AdminCommunity }>({ action: "adminCommunity", adminKey }) : Promise.resolve({ ok: true as const, community: { announcements: [], messages: [], campaigns: [], recipients: [] } }); }
export function saveAnnouncement(payload: { adminKey: string; helperName: string; id?: string; title: string; body: string; photoUrl: string; pinned: boolean; published: boolean }) { return postJson<{ announcement: Announcement }>({ action: "saveAnnouncement", ...payload }); }
export function moderateMessage(payload: { adminKey: string; messageId: string; actionType: "hide" | "restore" | "delete" | "pin" | "mute"; muteToken?: string }) { return postJson<{ message?: ChatMessage }>({ action: "moderateMessage", ...payload }); }
export function createCampaign(payload: { adminKey: string; helperName: string; title: string; subject: string; body: string; recipientTokens: string[]; siteUrl: string }) { return postJson<{ campaign: Campaign; recipients: CampaignRecipient[] }>({ action: "createCampaign", ...payload }); }
export function sendCampaignEmails(adminKey: string, campaignId: string) { return postJson<{ sent: number; simulated: boolean }>({ action: "sendCampaignEmails", adminKey, campaignId }); }
export function recordCampaignShare(adminKey: string, campaignId: string, token: string) { return postJson<{ recipient: CampaignRecipient }>({ action: "recordCampaignShare", adminKey, campaignId, token }); }
export async function uploadAnnouncementPhoto(adminKey: string, file: File) {
  const data = await fileToDataUrl(file);
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