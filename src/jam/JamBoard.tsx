import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AudioLines, Check, Disc3, Drum, Guitar, Heart, Mic2, Music2, RefreshCw, Search, Users } from "lucide-react";
import { LoadingState } from "../LoadingState";
import { ArtistChoice, Instrument, JamSong, JamState, jamRequest } from "./api";
import "./jam.css";

const instruments = [
  { id: "guitar", label: "Guitar", Icon: Guitar },
  { id: "bass", label: "Bass", Icon: Disc3 },
  { id: "drums", label: "Drums", Icon: Drum },
  { id: "vocals", label: "Vocals", Icon: Mic2 },
  { id: "acoustic", label: "Acoustic", Icon: Guitar },
  { id: "percussion", label: "Percussion", Icon: AudioLines },
] as const;
type View = "songs" | "favourites" | "equipment";

export default function JamBoard({ token }: { token: string }) {
  const [state, setState] = useState<JamState>();
  const [view, setView] = useState<View>("songs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const active = useRef(true);
  const requestInFlight = useRef(false);

  async function refresh(manual = false) {
    if (!token) { setLoading(false); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (manual) setRefreshing(true);
    const result = await jamRequest<{ state: JamState }>(token, "state");
    requestInFlight.current = false;
    if (!active.current) return;
    setLoading(false); setRefreshing(false);
    if (!result.ok) { setError(result.error); return; }
    setState(result.state); setError(""); setUpdatedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !requestInFlight.current && !(document.activeElement instanceof HTMLSelectElement)) void refresh(); }, 60000);
    return () => { active.current = false; window.clearInterval(timer); };
  }, [token]);

  async function mutate(action: string, values: Record<string, unknown>, key: string) {
    if (requestInFlight.current) return;
    requestInFlight.current = true; setPending(key); setError(""); setNotice("");
    const result = await jamRequest<{ state: JamState }>(token, action, values);
    requestInFlight.current = false;
    if (!active.current) return;
    setPending("");
    if (!result.ok) { setError(result.error); return; }
    setState(result.state); setNotice("Saved for everyone.");
    setUpdatedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  }

  const songs = useMemo(() => {
    if (!state) return [];
    return [...new Map(state.songs.map((song) => [song.id, song])).values()].filter((song) => view !== "favourites" || Boolean(state.votes[song.id]))
      .filter((song) => `${song.title} ${state.choices[song.id]?.artist || song.artist}`.toLowerCase().includes(search.toLowerCase()))
      .filter((song) => filter === "all" || (filter === "mine" ? state.claims.some((claim) => claim.songId === song.id && claim.memberId === state.viewer.id) : filter === "review" ? song.needsReview && !state.choices[song.id] : !state.claims.some((claim) => claim.songId === song.id)))
      .sort((a, b) => (view === "favourites" ? (state.votes[b.id] || 0) - (state.votes[a.id] || 0) : 0) || a.title.localeCompare(b.title));
  }, [state, search, filter, view]);

  const invitationUrl = `./#invite=${encodeURIComponent(token)}`;
  if (loading) return <LoadingState label="Getting the band together..." detail="Opening the shared songs and musician lineup." />;
  if (!token || !state) return <section className="jam-page jam-unavailable"><Music2 size={36} /><h1>The wedding jam</h1><p>{token ? error : "Open the music board from your personal invitation link."}</p>{token && <button className="secondary-action" onClick={() => void refresh(true)} disabled={refreshing}>Try again</button>}<a href={invitationUrl}>Back to invitation</a></section>;

  const activeMembers = state.members.filter((member) => member.enabled);
  const assigned = new Set(state.claims.map((claim) => claim.songId)).size;
  return <section className="jam-page" aria-label="Wedding jam planner">
    {pending && <LoadingState label={pending === "participation" ? "Updating the band lineup..." : "Saving your music choices..."} detail="Your changes are being shared with the band." />}
    <a className="jam-back" href={invitationUrl}><ArrowLeft size={16} /> Back to the invitation</a>
    <header className="jam-heading"><div><p className="eyebrow">Sunyoung & Eric · October 30</p><h1>The wedding jam</h1><p>A few familiar songs. A room full of friends.</p></div><span className="jam-event"><Music2 size={18} /> The Loft at The Pheasant Plucker</span></header>
    <section className="jam-lineup" aria-label="Your musician status">
      <div><span className="jam-avatar">{state.viewer.initials}</span><div><strong>Hi {state.viewer.name.split(/\s+/)[0]}.</strong><p>{state.viewer.enabled ? "You're in the lineup. Pick your favourites and the parts you'd like to play." : "Everyone gets a say in the soundtrack."}</p></div></div>
      <label className={`contact-toggle ${state.viewer.enabled ? "is-contacted" : ""}`}><input type="checkbox" role="switch" aria-label="I'm a musician" checked={state.viewer.enabled} disabled={Boolean(pending)} onChange={(event) => void mutate("participation", { enabled: event.target.checked }, "participation")} /><span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span><span>I'm a musician</span></label>
    </section>
    <section className={`jam-instructions ${state.viewer.enabled ? "for-musicians" : ""}`} aria-label="How to join in" aria-live="polite">
      <p><Heart size={18} aria-hidden="true" /><span><strong>Like the songs you'd love to hear.</strong> Click the heart on any song. Click again to undo your like.</span></p>
      {state.viewer.enabled ? <p><Music2 size={18} aria-hidden="true" /><span><strong>Choose what you'd like to play.</strong> Click the instrument(s) you want to play on each song, if any. You can choose more than one; click a selected instrument again to remove it.</span></p> : <p><Music2 size={18} aria-hidden="true" /><span>Want to play or sing? Turn on <strong>I'm a musician</strong> above to see the instrument choices.</span></p>}
    </section>
    <div className="jam-stats"><span><Users size={16} /> {activeMembers.length} musicians</span><span>{state.songs.length} songs</span><span>{assigned} songs with parts claimed</span><span className="jam-sync">{refreshing ? "Refreshing..." : updatedAt ? `Updated ${updatedAt}` : ""}<button type="button" title="Refresh shared board" aria-label="Refresh shared board" disabled={refreshing || Boolean(pending)} onClick={() => void refresh(true)}><RefreshCw size={16} className={refreshing ? "is-spinning" : ""} /></button></span></div>
    <div className="jam-feedback" aria-live="polite">{error ? <p className="error-message">{error} <button className="inline-link" onClick={() => void refresh(true)}>Refresh board</button></p> : <p>{notice || "Load-in: 6-7 PM. Let's make some music."}</p>}</div>
    <nav className="jam-tabs" aria-label="Music board views">{([{ id: "songs", label: "All songs" }, { id: "favourites", label: "Night's favourites" }, { id: "equipment", label: "People & equipment" }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={view === tab.id} className={view === tab.id ? "is-active" : ""} onClick={() => setView(tab.id)}>{tab.label}{tab.id === "songs" && <span>{new Set(state.songs.map((song) => song.id)).size}</span>}</button>)}</nav>
    {view === "equipment" ? <Equipment members={activeMembers} /> : <>
      <div className="jam-toolbar"><label className="jam-search"><Search size={17} /><input type="search" aria-label="Find a song or artist" placeholder="Find a song or artist" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filter songs" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All songs</option><option value="mine">My parts</option><option value="unclaimed">No parts yet</option><option value="review">Artist to confirm</option></select><span>{songs.length} shown</span></div>
      {view === "favourites" && <p className="jam-note">The guest-voted shortlist, most-loved first.</p>}
      <div className="jam-song-list">{songs.length ? songs.map((song, index) => <SongRow key={song.id} song={song} state={state} rank={index + 1} pending={Boolean(pending) || refreshing} onVote={(selected) => void mutate("vote", { songId: song.id, selected }, `${song.id}:vote`)} onClaim={(role, selected) => void mutate("setClaim", { songId: song.id, role, selected }, `${song.id}:${role}`)} onArtist={(artist, expectedRevision) => void mutate("artist", { songId: song.id, artist, expectedRevision }, `${song.id}:artist`)} />) : <div className="jam-empty">{view === "favourites" ? "The first vote starts the list. Pick a song from All songs." : "No songs match this view."}</div>}</div>
    </>}
  </section>;
}

function SongRow({ song, state, rank, pending, onVote, onClaim, onArtist }: { song: JamSong; state: JamState; rank: number; pending: boolean; onVote: (selected: boolean) => void; onClaim: (role: Instrument, selected: boolean) => void; onArtist: (artist: string, revision: number) => void }) {
  const choice: ArtistChoice | undefined = state.choices[song.id];
  const artist = choice?.artist || song.artist;
  const order = rank;
  const voted = state.myVotes.includes(song.id);
  const options = [...new Set([...song.options, ...(song.needsReview ? ["Needs confirmation"] : [])])];
  return <article className={`jam-song ${state.viewer.enabled ? "" : "voting-only"}`}><div className="jam-song-info"><span className="jam-song-number">{String(order).padStart(2, "0")}</span><div><h2>{song.title}{song.reviewNote.includes("(?)") && <span title="Marked uncertain in the original list"> (?)</span>}</h2>{options.length > 1 ? <select aria-label={`Artist for ${song.title}`} value={artist} disabled={!state.viewer.enabled || pending} onChange={(event) => onArtist(event.target.value, choice?.revision || 0)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <p>{artist}</p>}{song.needsReview && !choice && <div className="jam-song-tags"><span className="needs-review" title={song.reviewNote}>Artist to confirm</span></div>}</div></div>
    <div className="jam-song-actions"><button type="button" className={`jam-vote ${voted ? "is-voted" : ""}`} aria-pressed={voted} aria-label={`Vote for ${song.title}`} title={voted ? "Remove your vote" : "I'd love to hear this"} disabled={pending} onClick={() => onVote(!voted)}><Heart size={18} fill={voted ? "currentColor" : "none"} /><span>{state.votes[song.id] || 0}</span><small>{voted ? "Voted" : "Vote"}</small></button>
    {state.viewer.enabled && <div className="jam-instruments">{instruments.map(({ id, label, Icon }) => {
      const claims = state.claims.filter((claim) => claim.songId === song.id && claim.role === id);
      const mine = claims.some((claim) => claim.memberId === state.viewer.id);
      return <button key={id} className={`jam-instrument ${mine ? "is-mine" : ""}`} type="button" aria-label={`${song.title}: ${label}${mine ? ", your part selected" : ""}`} aria-pressed={mine} disabled={!state.viewer.enabled || pending} onClick={() => onClaim(id, !mine)} title={claims.length ? claims.map((claim) => state.members.find((member) => member.id === claim.memberId)?.name).filter(Boolean).join(", ") : label}><span><Icon size={20} />{mine && <Check size={11} className="jam-part-check" />}</span><small>{label}</small><span className="jam-assignees">{claims.length ? claims.map((claim) => { const member = state.members.find((entry) => entry.id === claim.memberId); return member ? <b key={member.id} title={member.name}>{member.initials}</b> : null; }) : <i aria-hidden="true">-</i>}</span></button>;
    })}</div>}</div>
  </article>;
}

function Equipment({ members }: { members: JamState["members"] }) {
  return <div className="jam-logistics"><section><p className="eyebrow">the lineup</p><h2>Friends making music</h2><div className="jam-members">{members.length ? members.map((member) => <div key={member.id}><span className="jam-avatar">{member.initials}</span><strong>{member.name}</strong></div>) : <p>The first musician gets the stage to themselves.</p>}</div></section><section><p className="eyebrow">getting set up</p><h2>Load-in, 6-7 PM</h2><dl><div><dt>Simon</dt><dd>PA, main microphone, main mic stand, and acoustic guitar. Extra microphone stands would help.</dd></div><div><dt>Mike Brown</dt><dd>Drum kit.</dd></div><div><dt>Eric</dt><dd>Bass rig and extra microphones. A guitar is available; no extra mic stands.</dd></div><div><dt>Jon Acheson</dt><dd>Could you bring a guitar amplifier if it is not too much trouble?</dd></div></dl><p className="jam-note">Equipment plan to coordinate with the band.</p></section></div>;
}
