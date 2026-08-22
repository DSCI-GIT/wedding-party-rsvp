export type HashRoute =
  | { view: "rsvp"; inviteToken: string }
  | { view: "contacts"; adminKey: string }
  | { view: "home" };

export function readHashRoute(): HashRoute {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);

  if (params.has("contacts") || hash.startsWith("contacts")) {
    return {
      view: "contacts",
      adminKey: params.get("admin") ?? "",
    };
  }

  const inviteToken = params.get("invite");
  if (inviteToken) {
    return { view: "rsvp", inviteToken };
  }

  return { view: "home" };
}

export function updateHash(values: Record<string, string | boolean>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      if (value) params.set(key, "");
    } else if (value) {
      params.set(key, value);
    }
  }
  window.location.hash = params.toString();
}
