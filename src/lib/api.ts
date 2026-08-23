export type RsvpStatus = "yes" | "maybe" | "no";
export type ShareMethod = "text" | "email" | "dm" | "copy" | "";
export type HouseholdType = "couple" | "single" | "unknown";

export type AdminResponse = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
  responderRole: "primary" | "partner";
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
  email: string;
  phone: string;
  dm: string;
  lastResponse?: {
    status: RsvpStatus;
    partnerComing: boolean;
    submittedAt: string;
  };
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
  householdId: "demo-sunyoung-eric",
  householdLabel: "Sunyoung & Eric",
  primaryName: "Sunyoung",
  partnerName: "Eric",
  email: "",
  phone: "",
  dm: "",
};

const demoContacts: ContactRow[] = [
  normalizeContactRow({
    householdId: "demo-sunyoung-eric",
    householdLabel: "Sunyoung & Eric",
    primaryName: "Sunyoung",
    partnerName: "Eric",
    inviteToken: "demo",
    email: "",
    phone: "",
    dm: "@sunyoung",
    contactPreference: "text",
    contactSource: "demo",
    contactStatus: "needs contact",
    detailsConfirmed: false,
    householdType: "couple",
    shareMethod: "text",
    shareStatus: "not shared",
    lastSharedAt: "",
    rsvpStatus: "waiting",
    lastRespondedAt: "",
    primaryDm: "@sunyoung",
    primaryContactPreference: "dm",
    partnerDm: "@eric",
    partnerContactPreference: "dm",
    suggestion: "Demo mode: connect Apps Script to load real private rows.",
  }),
  normalizeContactRow({
    householdId: "demo-sia-seijin",
    householdLabel: "Seijin & Sia",
    primaryName: "Seijin",
    partnerName: "Sia",
    inviteToken: "demo-sia",
    email: "",
    phone: "",
    dm: "",
    contactPreference: "email",
    contactSource: "demo",
    contactStatus: "needs review",
    detailsConfirmed: false,
    householdType: "couple",
    shareMethod: "email",
    shareStatus: "not shared",
    lastSharedAt: "",
    rsvpStatus: "waiting",
    lastRespondedAt: "",
    suggestion: "Demo mode: contact matching runs locally into private files.",
  }),
];

export async function fetchInvite(token: string): Promise<ApiResult<{ invite: Invite }> | ApiError> {
  if (!API_URL) {
    if (token === "demo") return { ok: true, invite: demoInvite };
    return {
      ok: false,
      error: "This invite link is missing or not connected yet.",
    };
  }

  const params = new URLSearchParams({ action: "invite", token });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  return response.json();
}

export async function submitRsvp(payload: {
  token: string;
  status: RsvpStatus;
  partnerComing: boolean;
  partnerNameOverride: string;
  email: string;
  phone: string;
  dm: string;
  note: string;
}): Promise<ApiResult<{ message: string }> | ApiError> {
  if (!API_URL) {
    await sleep(300);
    return { ok: true, message: "Demo RSVP saved locally for preview." };
  }

  return postJson({
    action: "submitRsvp",
    ...payload,
  });
}

export async function fetchContactRows(
  adminKey: string,
): Promise<ApiResult<{ rows: ContactRow[] }> | ApiError> {
  if (!API_URL) {
    if (adminKey === "demo-admin") return { ok: true, rows: demoContacts };
    return { ok: false, error: "Enter the admin key to load contact rows." };
  }

  const params = new URLSearchParams({ action: "adminList", adminKey });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  const result = await response.json();
  if (!result.ok) return result;
  return { ok: true, rows: result.rows.map(normalizeContactRow) };
}


export async function fetchResponses(adminKey: string): Promise<ApiResult<{ responses: AdminResponse[] }> | ApiError> {
  if (!API_URL) return { ok: true, responses: [] };
  const params = new URLSearchParams({ action: "adminResponses", adminKey });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  return response.json();
}
export async function saveContactRow(payload: {
  adminKey: string;
  helperName: string;
  householdId: string;
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
}): Promise<ApiResult<{ row: ContactRow }> | ApiError> {
  if (!API_URL) {
    await sleep(250);
    return {
      ok: true,
      row: normalizeContactRow({
        householdLabel: "",
        primaryName: "",
        partnerName: "",
        inviteToken: "demo",
        suggestion: "Demo save only.",
        rsvpStatus: "waiting",
        lastRespondedAt: "",
        ...payload,
      }),
    };
  }

  const result = await postJson<{ row: ContactRow }>({
    action: "updateContact",
    ...payload,
  });
  if (!result.ok) return result;
  return { ...result, row: normalizeContactRow(result.row) };
}


export async function splitContactRow(payload: {
  adminKey: string;
  helperName: string;
  householdId: string;
}): Promise<ApiResult<{ row: ContactRow; created: ContactRow }> | ApiError> {
  if (!API_URL) return { ok: false, error: "Connect Apps Script to split a household." };
  const result = await postJson<{ row: ContactRow; created: ContactRow }>({ action: "splitHousehold", ...payload });
  if (!result.ok) return result;
  return { ...result, row: normalizeContactRow(result.row), created: normalizeContactRow(result.created) };
}
function normalizeContactRow(row: Partial<ContactRow>): ContactRow {
  const primaryEmail = row.primaryEmail ?? row.email ?? "";
  const primaryPhone = row.primaryPhone ?? row.phone ?? "";
  const primaryDm = row.primaryDm ?? row.dm ?? "";
  const primaryContactPreference = row.primaryContactPreference ?? row.contactPreference ?? "";
  const primaryContactSource = row.primaryContactSource ?? row.contactSource ?? "";
  return {
    householdId: row.householdId ?? "",
    householdLabel: row.householdLabel ?? "",
    primaryName: row.primaryName ?? "",
    partnerName: row.partnerName ?? "",
    inviteToken: row.inviteToken ?? "",
    primaryInviteToken: row.primaryInviteToken ?? row.inviteToken ?? "",
    partnerInviteToken: row.partnerInviteToken ?? "",
    email: row.email ?? primaryEmail,
    phone: row.phone ?? primaryPhone,
    dm: row.dm ?? primaryDm,
    contactPreference: row.contactPreference ?? primaryContactPreference,
    contactSource: row.contactSource ?? primaryContactSource,
    contactStatus: row.contactStatus ?? "needs contact",
    detailsConfirmed: Boolean(row.detailsConfirmed),
    householdType: row.householdType ?? "unknown",
    shareMethod: row.shareMethod ?? "",
    shareStatus: row.shareStatus ?? "not shared",
    lastSharedAt: row.lastSharedAt ?? "",
    rsvpStatus: row.rsvpStatus ?? "waiting",
    lastRespondedAt: row.lastRespondedAt ?? "",
    primaryEmail,
    primaryPhone,
    primaryDm,
    primaryContactPreference,
    primaryContactSource,
    primaryContacted: row.primaryContacted === true,
    primaryLastContactedAt: row.primaryLastContactedAt ?? "",
    partnerEmail: row.partnerEmail ?? "",
    partnerPhone: row.partnerPhone ?? "",
    partnerDm: row.partnerDm ?? "",
    partnerContactPreference: row.partnerContactPreference ?? "",
    partnerContactSource: row.partnerContactSource ?? "",
    partnerContacted: row.partnerContacted === true,
    partnerLastContactedAt: row.partnerLastContactedAt ?? "",
    suggestion: row.suggestion ?? "",
  };
}

async function postJson<T>(payload: Record<string, unknown>): Promise<ApiResult<T> | ApiError> {
  const response = await fetch(API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}