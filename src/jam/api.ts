export type Instrument = "guitar" | "bass" | "drums" | "vocals" | "acoustic" | "percussion";
export type JamSong = { id: string; title: string; artist: string; options: string[]; needsReview: boolean; reviewNote: string; bandOrder: number | null; acousticOrder: number | null };
export type Musician = { id: string; name: string; initials: string; enabled: boolean };
export type Claim = { songId: string; role: Instrument; memberId: string };
export type ArtistChoice = { artist: string; revision: number };
export type JamState = { viewer: Musician; members: Musician[]; songs: JamSong[]; claims: Claim[]; ownClaims?: Claim[]; choices: Record<string, ArtistChoice>; votes: Record<string, number>; myVotes: string[] };
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const endpoint = import.meta.env.VITE_JAM_API_URL as string | undefined;

export async function jamRequest<T>(token: string, action: string, values: Record<string, unknown> = {}): Promise<Result<T>> {
  if (!endpoint) return { ok: false, error: "The music board is waiting for its shared storage connection. Please check back shortly." };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token, action, ...values }), signal: controller.signal, redirect: "follow", keepalive: action === "batch" });
    if (!response.ok) throw new Error("request");
    return await response.json();
  } catch {
    return { ok: false, error: "We could not confirm that update. Refresh to check what saved before trying again." };
  } finally { window.clearTimeout(timer); }
}

export function jamExitSave(token: string, values: Record<string, unknown>) {
  if (!endpoint) return false;
  const body = JSON.stringify({ token, action: "batch", ...values });
  try {
    if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: "text/plain;charset=utf-8" }))) return true;
  } catch { /* Fall through to the keepalive request. */ }
  try {
    void fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, keepalive: true }).catch(() => {});
    return true;
  } catch { return false; }
}
