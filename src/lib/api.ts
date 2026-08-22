export type RsvpStatus = "yes" | "maybe" | "no";

export type Invite = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
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
  email: string;
  phone: string;
  dm: string;
  contactPreference: string;
  contactSource: string;
  contactStatus: string;
  detailsConfirmed: boolean;
  householdType: "couple" | "single" | "unknown";
  shareMethod: "text" | "email" | "dm" | "copy" | "";
  shareStatus: string;
  lastSharedAt: string;
  rsvpStatus: "waiting" | RsvpStatus;
  lastRespondedAt: string;
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
};

const demoContacts: ContactRow[] = [
  {
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
    suggestion: "Demo mode: connect Apps Script to load real private rows.",
  },
  {
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
  },
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
  householdType: "couple" | "single" | "unknown";
  shareMethod: "text" | "email" | "dm" | "copy" | "";
  shareStatus: string;
  lastSharedAt: string;
}): Promise<ApiResult<{ row: ContactRow }> | ApiError> {
  if (!API_URL) {
    await sleep(250);
    return {
      ok: true,
      row: {
        householdLabel: "",
        primaryName: "",
        partnerName: "",
        inviteToken: "demo",
        suggestion: "Demo save only.",
        rsvpStatus: "waiting",
        lastRespondedAt: "",
        ...payload,
      },
    };
  }

  return postJson({
    action: "updateContact",
    ...payload,
  });
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