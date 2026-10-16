import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, AudioLines, Check, CloudOff, CloudUpload, Disc3, Drum, Guitar, Heart, Mic2, Music2, RefreshCw, Search, Users } from "lucide-react";
import { LoadingState } from "../LoadingState";
import { ArtistChoice, Instrument, JamSong, JamState, jamExitSave, jamRequest } from "./api";
import { installJamSync, JamSync, MusicChange } from "./sync";
import "./jam.css";
import { JamChat } from "./JamChat";

const instruments = [
  { id: "guitar", label: "Guitar", Icon: Guitar },
  { id: "bass", label: "Bass", Icon: Disc3 },
  { id: "drums", label: "Drums", Icon: Drum },
  { id: "vocals", label: "Vocals", Icon: Mic2 },
  { id: "acoustic", label: "Acoustic", Icon: Guitar },
  { id: "percussion", label: "Percussion", Icon: AudioLines },
] as const;
type View = "songs" | "favourites";

export default function JamBoard({ token }: { token: string }) {
  const sync = useMemo(() => new JamSync(token, { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }, (action, values) => jamRequest(token, action, values), (batch) => jamExitSave(token, batch)), [token]);
  const { state, pending, syncing, refreshing, loading, error, localError, updatedAt } = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const [view, setView] = useState<View>("songs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [equipmentOpen, setEquipmentOpen] = useState<boolean | null>(null);
  useEffect(() => installJamSync(sync), [sync]);

  function mutate(action: string, values: Omit<MusicChange, "action">) { sync.change({ action, ...values }); }

  const songs = useMemo(() => {
    if (!state) return [];
    return [...new Map(state.songs.map((song) => [song.id, song])).values()].filter((song) => view !== "favourites" || Boolean(state.votes[song.id]))
      .filter((song) => `${song.title} ${state.choices[song.id]?.artist || song.artist}`.toLowerCase().includes(search.toLowerCase()))
      .filter((song) => filter === "all" || (filter === "mine" ? state.claims.some((claim) => claim.songId === song.id && claim.memberId === state.viewer.id) : filter === "review" ? song.needsReview && !state.choices[song.id] : !state.claims.some((claim) => claim.songId === song.id)))
      .sort((a, b) => (view === "favourites" ? (state.votes[b.id] || 0) - (state.votes[a.id] || 0) : 0) || a.title.localeCompare(b.title));
  }, [state, search, filter, view]);

  const invitationUrl = `./#invite=${encodeURIComponent(token)}`;
  if (loading) return <LoadingState label="Getting the band together..." detail="Opening the shared songs and musician lineup." />;
  if (!token || !state) return <section className="jam-page jam-unavailable"><Music2 size={36} /><h1>The wedding jam</h1><p>{token ? error : "Open the music board from your personal invitation link."}</p>{token && <button className="secondary-action" onClick={() => void sync.start()} disabled={refreshing}>Try again</button>}<a href={invitationUrl}>Back to invitation</a></section>;

  const activeMembers = state.members.filter((member) => member.enabled);
  const assigned = new Set(state.claims.map((claim) => claim.songId)).size;
  return <section className="jam-page" aria-label="Wedding jam planner">
    <a className="jam-back" href={invitationUrl}><ArrowLeft size={16} /> Back to the invitation</a>
    <header className="jam-heading"><div><p className="eyebrow">Sunyoung & Eric · October 30</p><h1>The wedding jam</h1><p>A few familiar songs. A room full of friends.</p></div><span className="jam-event"><Music2 size={18} /> The Loft at The Pheasant Plucker</span></header>
    <section className="jam-lineup" aria-label="Your musician status">
      <div><span className="jam-avatar">{state.viewer.initials}</span><div><strong>Hi {state.viewer.name.split(/\s+/)[0]}.</strong><p>{state.viewer.enabled ? "Pick your favourites and let us know which parts you could cover." : "Everyone gets a say in the soundtrack."}</p></div></div>
      <label className={`contact-toggle ${state.viewer.enabled ? "is-contacted" : ""}`}><input type="checkbox" role="switch" aria-label="I'm a musician" checked={state.viewer.enabled} onChange={(event) => mutate("participation", { enabled: event.target.checked })} /><span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span><span>I'm a musician</span></label>
    </section>
    <section className={`jam-instructions ${state.viewer.enabled ? "for-musicians" : ""}`} aria-label="How to join in" aria-live="polite">
      <p><Heart size={18} aria-hidden="true" /><span><strong>Everyone: pick at least 30 songs!</strong> We won't get to play them all, but we'd love to see everyone's favourites. Click the heart on songs you'd love to hear; click again to undo your like.</span></p>
      <p className="jam-pick-count"><strong>{state.myVotes.length} {state.myVotes.length === 1 ? "song" : "songs"} picked</strong><span>{state.myVotes.length < 30 ? `${30 - state.myVotes.length} more to reach 30. Keep exploring!` : "You've reached 30. Keep picking if more catch your ear!"}</span></p>
      {state.viewer.enabled ? <p><Music2 size={18} aria-hidden="true" /><span><strong>What could you cover?</strong> Select any instruments you could play on each song, including vocals. Multiple musicians can select the same part: this is availability, not a reservation. Select again to remove only your own choice.</span></p> : <p><Music2 size={18} aria-hidden="true" /><span>Want to play or sing? Turn on <strong>I'm a musician</strong> above to see the instrument choices.</span></p>}
    </section>
    <div className="jam-stats"><span><Users size={16} /> {activeMembers.length} musicians</span><span>{state.songs.length} songs</span><span>{assigned} songs with willing musicians</span><span className="jam-sync">{syncing ? "Syncing..." : refreshing ? "Refreshing..." : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}<button type="button" title={pending ? "Sync saved choices now" : "Refresh shared board"} aria-label={pending ? "Sync saved choices now" : "Refresh shared board"} disabled={refreshing || syncing} onClick={() => void sync.syncOrRefresh()}>{pending ? <CloudUpload size={16} className={syncing ? "is-spinning" : ""} /> : <RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />}</button></span></div>
    <div className="jam-feedback" aria-live="polite">{localError ? <p className="error-message">{localError} <button className="inline-link" onClick={() => void sync.syncOrRefresh()}>Sync now</button></p> : syncing ? <p className="jam-saving-status"><CloudUpload size={16} className="is-spinning" aria-hidden="true" /><span>Saving in the background. Keep picking; your choices are safe on this device.</span></p> : error ? <p className="jam-sync-paused" title={error}><CloudOff size={16} aria-hidden="true" /><span>{pending ? "Saved on this device. Shared sync is paused; we'll retry automatically." : "Showing your saved song list. Shared updates are temporarily paused."}</span><button className="inline-link" onClick={() => void sync.syncOrRefresh()}>Sync now</button></p> : <p>{pending ? `Saved on this device · ${pending} pending. Syncs every 5 minutes or when you leave.` : "All choices synced. Load-in: 6-7 PM."}</p>}</div>
    <details className="jam-people-block" open={equipmentOpen ?? state.viewer.enabled}>
      <summary onClick={(event) => { event.preventDefault(); setEquipmentOpen(!(equipmentOpen ?? state.viewer.enabled)); }}>People &amp; equipment <span>Lineup, load-in &amp; musician messages</span></summary>
      <Equipment members={activeMembers} />
      {(equipmentOpen ?? state.viewer.enabled) && <JamChat token={token} musician={state.viewer.enabled} />}
    </details>
    <nav className="jam-tabs" aria-label="Music board views">{([{ id: "songs", label: "All songs" }, { id: "favourites", label: "Night's favourites" }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={view === tab.id} className={view === tab.id ? "is-active" : ""} onClick={() => setView(tab.id)}>{tab.label}{tab.id === "songs" && <span>{new Set(state.songs.map((song) => song.id)).size}</span>}</button>)}</nav>
    <>
      <div className="jam-toolbar"><label className="jam-search"><Search size={17} /><input type="search" aria-label="Find a song or artist" placeholder="Find a song or artist" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filter songs" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All songs</option><option value="mine">Parts I could cover</option><option value="unclaimed">No volunteers yet</option><option value="review">Artist to confirm</option></select><span>{songs.length} shown</span></div>
      {view === "favourites" && <p className="jam-note">The guest-voted shortlist, most-loved first.</p>}
      <div className="jam-song-list">{songs.length ? songs.map((song, index) => <SongRow key={song.id} song={song} state={state} rank={index + 1} onVote={(selected) => mutate("vote", { songId: song.id, selected })} onClaim={(role, selected) => mutate("setClaim", { songId: song.id, role, selected })} onArtist={(artist, expectedRevision) => mutate("artist", { songId: song.id, artist, expectedRevision })} />) : <div className="jam-empty">{view === "favourites" ? "The first vote starts the list. Pick a song from All songs." : "No songs match this view."}</div>}</div>
    </>
  </section>;
}

function SongRow({ song, state, rank, onVote, onClaim, onArtist }: { song: JamSong; state: JamState; rank: number; onVote: (selected: boolean) => void; onClaim: (role: Instrument, selected: boolean) => void; onArtist: (artist: string, revision: number) => void }) {
  const choice: ArtistChoice | undefined = state.choices[song.id];
  const artist = choice?.artist || song.artist;
  const order = rank;
  const voted = state.myVotes.includes(song.id);
  const options = [...new Set([...song.options, ...(song.needsReview ? ["Needs confirmation"] : [])])];
  return <article className={`jam-song ${state.viewer.enabled ? "" : "voting-only"}`}><div className="jam-song-info"><span className="jam-song-number">{String(order).padStart(2, "0")}</span><div><h2>{song.title}{song.reviewNote.includes("(?)") && <span title="Marked uncertain in the original list"> (?)</span>}</h2>{options.length > 1 ? <select aria-label={`Artist for ${song.title}`} value={artist} disabled={!state.viewer.enabled} onChange={(event) => onArtist(event.target.value, choice?.revision || 0)}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <p>{artist}</p>}{song.needsReview && !choice && <div className="jam-song-tags"><span className="needs-review" title={song.reviewNote}>Artist to confirm</span></div>}</div></div>
    <div className="jam-song-actions"><button type="button" className={`jam-vote ${voted ? "is-voted" : ""}`} aria-pressed={voted} aria-label={`Vote for ${song.title}`} title={voted ? "Remove your vote" : "I'd love to hear this"} onClick={() => onVote(!voted)}><Heart size={18} fill={voted ? "currentColor" : "none"} /><span>{state.votes[song.id] || 0}</span><small>{voted ? "Voted" : "Vote"}</small></button>
    {state.viewer.enabled && <div className="jam-instruments">{instruments.map(({ id, label, Icon }) => {
      const claims = state.claims.filter((claim) => claim.songId === song.id && claim.role === id);
      const mine = claims.some((claim) => claim.memberId === state.viewer.id);
      return <button key={id} className={`jam-instrument ${mine ? "is-mine" : ""}`} type="button" aria-label={`${song.title}: ${label}${mine ? ", you could cover this part" : ""}`} aria-pressed={mine} disabled={!state.viewer.enabled} onClick={() => onClaim(id, !mine)} title={claims.length ? claims.map((claim) => state.members.find((member) => member.id === claim.memberId)?.name).filter(Boolean).join(", ") : label}><span><Icon size={20} />{mine && <Check size={11} className="jam-part-check" />}</span><small>{label}</small><span className="jam-assignees">{claims.length ? claims.map((claim) => { const member = state.members.find((entry) => entry.id === claim.memberId); return member ? <b key={member.id} title={member.name}>{member.initials}</b> : null; }) : <i aria-hidden="true">-</i>}</span></button>;
    })}</div>}</div>
  </article>;
}

function Equipment({ members }: { members: JamState["members"] }) {
  return <div className="jam-logistics"><section><p className="eyebrow">the lineup</p><h2>Friends making music</h2><div className="jam-members">{members.length ? members.map((member) => <div key={member.id}><span className="jam-avatar">{member.initials}</span><strong>{member.name}</strong></div>) : <p>The first musician gets the stage to themselves.</p>}</div></section><section><p className="eyebrow">getting set up</p><h2>Load-in, 6-7 PM</h2><dl><div><dt>Simon</dt><dd>PA, main microphone, main mic stand, and acoustic guitar. Extra microphone stands would help.</dd></div><div><dt>Mike Brown</dt><dd>Drum kit.</dd></div><div><dt>Eric</dt><dd>Bass rig and extra microphones. A guitar is available; no extra mic stands.</dd></div><div><dt>Jon Acheson</dt><dd>Could you bring a guitar amplifier if it is not too much trouble?</dd></div></dl><p className="jam-note">Equipment plan to coordinate with the band.</p></section></div>;
}
