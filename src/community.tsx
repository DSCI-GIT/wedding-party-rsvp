import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminCommunity,
  Announcement,
  Campaign,
  CampaignRecipient,
  ChatMessage,
  Community,
  ContactRow,
  createCampaign,
  fetchAdminCommunity,
  fetchCommunity,
  moderateMessage,
  postChatMessage,
  recordCampaignShare,
  saveAnnouncement,
  sendCampaignEmails,
  setCommunityUsername,
  uploadAnnouncementPhoto,
  resetDemoData,
} from "./lib/api";

type LoadState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

type AdminView = "feed" | "chat" | "campaigns" | "demo";

export function GuestCommunity({ token, name, onEditRsvp, justSubmitted }: { token: string; name: string; onEditRsvp: () => void; justSubmitted: boolean }) {
  const [load, setLoad] = useState<LoadState<Community>>({ state: "loading" });
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await fetchCommunity(token);
    if (!result.ok) { setLoad({ state: "error", message: result.error }); return; }
    setLoad({ state: "ready", data: result.community });
    setHandle((current) => current || result.community.profile.displayName);
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.activeElement?.tagName !== "TEXTAREA") void refresh(); }, 20000);
    return () => window.clearInterval(timer);
  }, [token]);

  async function saveHandle() {
    setBusy(true);
    const result = await setCommunityUsername(token, handle);
    setBusy(false);
    if (!result.ok) { setNotice(result.error); return; }
    setHandle(result.profile.displayName);
    setNotice("Handle saved.");
    void refresh();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    const result = await postChatMessage(token, message);
    setBusy(false);
    if (!result.ok) { setNotice(result.error); return; }
    setMessage("");
    if (result.openRsvp) { onEditRsvp(); return; }
    setNotice(result.botMessage?.body || "Posted.");
    void refresh();
  }

  if (load.state === "loading") return <div className="community-loading">Opening the party line...</div>;
  if (load.state === "error") return <div className="community-fallback"><strong>Your RSVP is saved.</strong><span>{load.message}</span><button className="secondary-action compact" type="button" onClick={onEditRsvp}>Update RSVP or contact details</button></div>;
  if (!load.data.unlocked) return <div className="community-fallback"><strong>Your RSVP unlocks the party line.</strong><button className="primary-action compact" type="button" onClick={onEditRsvp}>RSVP now</button></div>;

  const community = load.data;
  return <section className="community-invite" aria-label="Wedding party updates and chat">
    {justSubmitted && <div className="community-welcome"><p className="eyebrow">RSVP saved</p><h2>Thank you, {name}.</h2><span>The party line is open.</span></div>}
    <header className="community-header"><div><p className="eyebrow">private party line</p><h2>{community.topic}</h2></div><button className="secondary-action compact" type="button" onClick={onEditRsvp}>Update RSVP</button></header>
    <AnnouncementFeed announcements={community.announcements} />
    <section className="irc-panel" aria-label="Wedding group chat">
      <header className="irc-header"><strong>#sunyoung-eric</strong><span>{community.messages.length} messages</span></header>
      <div className="irc-messages" aria-live="polite">
        {community.messages.length === 0 && <p className="irc-empty">The channel is quiet. That feels temporary.</p>}
        {community.messages.map((entry) => <ChatLine entry={entry} key={entry.id} />)}
      </div>
      <div className="irc-handle"><label className="field"><span>Handle</span><input maxLength={40} value={handle} onChange={(event) => setHandle(event.target.value)} /></label><button className="secondary-action compact" type="button" disabled={busy} onClick={() => void saveHandle()}>Save</button></div>
      <form className="irc-compose" onSubmit={send}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Say something nice, /help for commands" maxLength={500} /><button className="primary-action compact" type="submit" disabled={busy}>{busy ? "..." : "Send"}</button></form>
      {notice && <p className="irc-notice">{notice}</p>}
    </section>
  </section>;
}

export function AdminCommunityHub({ adminKey, helperName, view, contacts, demoMode }: { adminKey: string; helperName: string; view: AdminView; contacts: ContactRow[]; demoMode: boolean }) {
  const [load, setLoad] = useState<LoadState<AdminCommunity>>({ state: "loading" });
  async function refresh() {
    const result = await fetchAdminCommunity(adminKey);
    if (!result.ok) { setLoad({ state: "error", message: result.error }); return; }
    setLoad({ state: "ready", data: result.community });
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (!isEditingField()) void refresh(); }, 20000); return () => window.clearInterval(timer); }, [adminKey]);
  if (load.state === "loading") return <div className="admin-empty">Loading private community tools...</div>;
  if (load.state === "error") return <div className="admin-empty error-message">{load.message}</div>;
  if (view === "feed") return <FeedManager adminKey={adminKey} helperName={helperName} data={load.data} onRefresh={refresh} />;
  if (view === "chat") return <ChatModeration adminKey={adminKey} messages={load.data.messages} onRefresh={refresh} />;
  if (view === "campaigns") return <CampaignManager adminKey={adminKey} helperName={helperName} contacts={contacts} data={load.data} onRefresh={refresh} />;
  return demoMode ? <DemoPersonas data={load.data} adminKey={adminKey} onRefresh={refresh} /> : <div className="admin-empty">Demo controls only exist in the isolated demo site.</div>;
}

function AnnouncementFeed({ announcements }: { announcements: Announcement[] }) {
  if (!announcements.length) return <section className="announcement-feed empty-feed"><p className="eyebrow">updates</p><p>Fresh updates will appear here.</p></section>;
  return <section className="announcement-feed" aria-label="Wedding party updates">{announcements.map((announcement) => <article className={`announcement ${announcement.pinned ? "is-pinned" : ""}`} key={announcement.id}>{announcement.photoUrl && <img src={announcement.photoUrl} alt="Wedding party update" />}<div><p className="eyebrow">{announcement.pinned ? "pinned update" : "update"}</p><h3>{announcement.title}</h3><p>{announcement.body}</p></div></article>)}</section>;
}

function ChatLine({ entry }: { entry: ChatMessage }) {
  return <p className={`irc-line irc-${entry.kind}`}><time>{timeOnly(entry.createdAt)}</time>{entry.kind === "action" ? <><strong>* {entry.displayName}</strong> {entry.body}</> : <><strong>&lt;{entry.displayName}&gt;</strong> {entry.body}</>}</p>;
}

function FeedManager({ adminKey, helperName, data, onRefresh }: { adminKey: string; helperName: string; data: AdminCommunity; onRefresh: () => Promise<void> }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [photoUrl, setPhotoUrl] = useState(""); const [pinned, setPinned] = useState(false); const [published, setPublished] = useState(true); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) { if (!file) return; setBusy(true); const result = await uploadAnnouncementPhoto(adminKey, file); setBusy(false); if (!result.ok) { setMessage(result.error); return; } setPhotoUrl(result.photoUrl); setMessage("Photo ready to attach."); }
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); const result = await saveAnnouncement({ adminKey, helperName, title, body, photoUrl, pinned, published }); setBusy(false); if (!result.ok) { setMessage(result.error); return; } setTitle(""); setBody(""); setPhotoUrl(""); setPinned(false); setMessage(published ? "Announcement published." : "Draft saved."); await onRefresh(); }
  return <div className="admin-workspace"><section className="admin-composer"><div><p className="eyebrow">feed</p><h2>Post an update</h2></div><form onSubmit={save}><label className="field"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label><label className="field"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} /></label><label className="field"><span>Photo</span><input type="file" accept="image/*" onChange={(event) => void upload(event.target.files?.[0])} /></label>{photoUrl && <img className="upload-preview" src={photoUrl} alt="Announcement upload preview" />}<div className="toggle-row"><label><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Publish now</label><label><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Pin it</label></div><button className="primary-action compact" disabled={busy} type="submit">{busy ? "Saving..." : "Save update"}</button>{message && <p className="mini-success">{message}</p>}</form></section><section className="admin-feed-list"><p className="eyebrow">existing</p>{data.announcements.map((announcement) => <article key={announcement.id}><strong>{announcement.title}</strong><span>{announcement.pinned ? "Pinned" : "Standard"} · {announcement.createdBy}</span><p>{announcement.body}</p></article>)}</section></div>;
}

function ChatModeration({ adminKey, messages, onRefresh }: { adminKey: string; messages: ChatMessage[]; onRefresh: () => Promise<void> }) {
  const [notice, setNotice] = useState("");
  async function act(message: ChatMessage, actionType: "hide" | "restore" | "delete" | "pin" | "mute") { const result = await moderateMessage({ adminKey, messageId: message.id, actionType, muteToken: message.token }); if (!result.ok) { setNotice(result.error); return; } setNotice("Saved."); await onRefresh(); }
  return <section className="admin-workspace moderation"><div><p className="eyebrow">chat moderation</p><h2>Keep the party line friendly.</h2></div>{notice && <p className="mini-success">{notice}</p>}<div className="moderation-list">{messages.length === 0 && <p className="admin-empty">No chat messages yet.</p>}{messages.map((message) => <article className={message.deleted ? "is-deleted" : ""} key={message.id}><div><strong>{message.displayName}</strong><span>{timeOnly(message.createdAt)} · {message.kind}</span><p>{message.body}</p></div><div className="moderation-actions"><button type="button" onClick={() => void act(message, message.visible ? "hide" : "restore")}>{message.visible ? "Hide" : "Restore"}</button><button type="button" onClick={() => void act(message, "pin")}>{message.pinned ? "Unpin" : "Pin"}</button><button type="button" onClick={() => void act(message, "mute")}>Mute 1h</button><button className="danger" type="button" onClick={() => void act(message, "delete")}>Delete</button></div></article>)}</div></section>;
}

function CampaignManager({ adminKey, helperName, contacts, data, onRefresh }: { adminKey: string; helperName: string; contacts: ContactRow[]; data: AdminCommunity; onRefresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | "not-contacted" | "yes" | "maybe" | "no">("all"); const [title, setTitle] = useState(""); const [subject, setSubject] = useState("Sunyoung & Eric's wedding party"); const [body, setBody] = useState("Hi {name},\n\nSunyoung and Eric are getting married. We would love to celebrate with you on October 30.\n\nYour private link: {invite}"); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const recipients = useMemo(() => peopleFromContacts(contacts).filter((person) => filter === "all" || (filter === "not-contacted" ? !person.contacted : person.rsvpStatus === filter)), [contacts, filter]);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); const result = await createCampaign({ adminKey, helperName, title, subject, body, recipientTokens: recipients.map((person) => person.token), siteUrl: siteBaseUrl() }); setBusy(false); if (!result.ok) { setNotice(result.error); return; } setTitle(""); setNotice(`Campaign created for ${result.campaign.recipientCount} people.`); await onRefresh(); }
  async function sendEmail(campaign: Campaign) { if (!window.confirm(`Send this campaign to every unsent email address?`)) return; const result = await sendCampaignEmails(adminKey, campaign.id); if (!result.ok) { setNotice(result.error); return; } setNotice(result.simulated ? `${result.sent} demo emails simulated.` : `${result.sent} emails sent.`); await onRefresh(); }
  async function share(campaign: Campaign, recipient: CampaignRecipient) { const url = `${siteBaseUrl()}#invite=${encodeURIComponent(recipient.token)}`; const text = campaign.body.replace(/\{name\}/g, recipient.name).replace(/\{invite\}/g, url); try { if (navigator.share && window.matchMedia("(pointer: coarse)").matches) await navigator.share({ title: campaign.title, text, url }); else await navigator.clipboard.writeText(text); } catch { return; } const result = await recordCampaignShare(adminKey, campaign.id, recipient.token); if (result.ok) { setNotice("Share marked."); await onRefresh(); } }
  return <div className="admin-workspace campaigns"><section className="admin-composer"><p className="eyebrow">campaigns</p><h2>Prepare a personal outreach</h2><form onSubmit={create}><label className="field"><span>Recipients</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Everyone</option><option value="not-contacted">Not contacted</option><option value="yes">RSVP yes</option><option value="maybe">RSVP maybe</option><option value="no">RSVP no</option></select></label><p className="recipient-count">{recipients.length} people selected</p><label className="field"><span>Campaign title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Email subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="field"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} /></label><button className="primary-action compact" type="submit" disabled={busy}>Create campaign</button>{notice && <p className="mini-success">{notice}</p>}</form></section><section className="campaign-list">{data.campaigns.length === 0 && <p className="admin-empty">No campaigns yet.</p>}{data.campaigns.map((campaign) => <CampaignCard campaign={campaign} recipients={data.recipients.filter((recipient) => recipient.campaignId === campaign.id)} onSend={() => void sendEmail(campaign)} onShare={(recipient) => void share(campaign, recipient)} key={campaign.id} />)}</section></div>;
}

function CampaignCard({ campaign, recipients, onSend, onShare }: { campaign: Campaign; recipients: CampaignRecipient[]; onSend: () => void; onShare: (recipient: CampaignRecipient) => void }) { return <article className="campaign-card"><header><div><p className="eyebrow">{formatShortDate(campaign.createdAt)}</p><h3>{campaign.title}</h3></div><button className="primary-action compact" type="button" onClick={onSend}>Send email</button></header><p>{campaign.recipientCount} recipients · {campaign.emailSentCount} emailed · {campaign.sharedCount} shared</p><div className="campaign-recipient-list">{recipients.map((recipient) => <div key={recipient.id}><strong>{recipient.name}</strong><span>{recipient.emailStatus === "sent" ? "Emailed" : recipient.email ? "Email ready" : "No email"} · {recipient.shareStatus === "shared" ? "Shared" : "Not shared"}</span><button className="secondary-action compact" type="button" onClick={() => onShare(recipient)}>Share</button></div>)}</div></article>; }

function DemoPersonas({ data, adminKey, onRefresh }: { data: AdminCommunity; adminKey: string; onRefresh: () => Promise<void> }) {
  const personas = data.personas || [];
  const [notice, setNotice] = useState("");
  async function copy(token: string) { await navigator.clipboard.writeText(`${siteBaseUrl()}#invite=${encodeURIComponent(token)}`); setNotice("Fake invite link copied."); }
  async function reset() { if (!window.confirm("Reset the demo to its invented starting data?")) return; const result = await resetDemoData(adminKey); if (!result.ok) { setNotice(result.error); return; } setNotice("Demo reset."); await onRefresh(); }
  return <section className="admin-workspace"><div className="demo-heading"><div><p className="eyebrow">demo personas</p><h2>Try the guest view</h2></div><button className="secondary-action compact" type="button" onClick={() => void reset()}>Reset demo</button></div>{notice && <p className="mini-success">{notice}</p>}<div className="persona-list">{personas.map((persona) => <div key={persona.token}><strong>{persona.name}</strong><span><button className="inline-link" type="button" onClick={() => void copy(persona.token)}>Copy link</button><a href={`${siteBaseUrl()}#invite=${encodeURIComponent(persona.token)}`} target="_blank" rel="noreferrer">Open invite</a></span></div>)}</div></section>;
}

function peopleFromContacts(rows: ContactRow[]) { return rows.flatMap((row) => [{ token: row.primaryInviteToken || row.inviteToken, contacted: row.primaryContacted, rsvpStatus: row.rsvpStatus, name: row.primaryName }, ...(row.partnerName ? [{ token: row.partnerInviteToken, contacted: row.partnerContacted, rsvpStatus: row.rsvpStatus, name: row.partnerName }] : [])]).filter((person) => person.token); }
function isEditingField() { const tag = document.activeElement?.tagName; return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"; }
function siteBaseUrl() { return `${window.location.origin}${window.location.pathname}`; }
function timeOnly(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatShortDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month: "short", day: "numeric" }); }