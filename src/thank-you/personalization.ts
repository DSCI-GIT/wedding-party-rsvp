export type PersonalThanks = { name: string; partnerName: string; gift: boolean; attended: boolean };
type Envelope = { iv: string; data: string };

export function firstName(name: string) { return name.trim().split(/\s+/)[0] || ""; }
export function guestGreeting(guest: PersonalThanks) {
  return [firstName(guest.name), firstName(guest.partnerName)].filter(Boolean).join(" & ");
}

export async function decodeThanks(token: string, manifest: Record<string, Envelope>): Promise<PersonalThanks | null> {
  const encode = (value: string) => new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", encode("wedding-thanks-index-v1:" + token));
  const lookup = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const envelope = Object.prototype.hasOwnProperty.call(manifest, lookup) ? manifest[lookup] : undefined;
  if (!envelope) return null;
  const keyBytes = await crypto.subtle.digest("SHA-256", encode("wedding-thanks-key-v1:" + token));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv) }, key, bytes(envelope.data));
  const guest: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!guest || typeof guest !== "object" || !("name" in guest) || typeof guest.name !== "string" || !("partnerName" in guest) || typeof guest.partnerName !== "string" || !("gift" in guest) || typeof guest.gift !== "boolean" || !("attended" in guest) || typeof guest.attended !== "boolean") throw Error("Personal note could not be read.");
  return guest as PersonalThanks;
}
