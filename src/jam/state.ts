import type { JamState } from "./api";

export function isJamState(value: unknown): value is JamState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item));
  const member = (item: unknown) => record(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.initials === "string" && typeof item.enabled === "boolean";
  const claim = (item: unknown) => record(item) && typeof item.songId === "string" && typeof item.memberId === "string" && typeof item.role === "string";
  return member(state.viewer)
    && Array.isArray(state.members) && state.members.every(member)
    && Array.isArray(state.songs) && state.songs.every((song) => record(song) && typeof song.id === "string" && typeof song.title === "string" && typeof song.artist === "string" && Array.isArray(song.options) && song.options.every((option) => typeof option === "string") && typeof song.needsReview === "boolean" && typeof song.reviewNote === "string" && (song.bandOrder === null || typeof song.bandOrder === "number") && (song.acousticOrder === null || typeof song.acousticOrder === "number"))
    && Array.isArray(state.claims) && state.claims.every(claim)
    && (state.ownClaims === undefined || Array.isArray(state.ownClaims) && state.ownClaims.every(claim))
    && Array.isArray(state.myVotes) && state.myVotes.every((id) => typeof id === "string")
    && record(state.votes) && Object.values(state.votes).every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0)
    && record(state.choices) && Object.values(state.choices).every((choice) => record(choice) && typeof choice.artist === "string" && typeof choice.revision === "number" && Number.isFinite(choice.revision));
}
