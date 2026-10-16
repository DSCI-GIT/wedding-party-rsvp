import { FormEvent, useEffect, useRef, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { ChatLine } from "../community";
import { ChatMessage, fetchJamChat, postJamChat, setCommunityUsername } from "../lib/api";

export function JamChat({ token, musician }: { token: string; musician: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [handle, setHandle] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await fetchJamChat(token);
      if (!alive.current) return;
      if (!result.ok) { setNotice(result.error); return; }
      // Older deployments ignore channel parameters. Never let jam notes land in the party chat.
      if (result.community.channel !== "jam") { setNotice("The separate jam channel is waiting for the Apps Script update."); return; }
      if (!result.community.unlocked) { setNotice("Complete your RSVP on the invitation to join this channel."); return; }
      setMessages(result.community.messages.filter((entry) => entry.channel === "jam"));
      setHandle((current) => current || result.community.profile.displayName);
      setReady(true);
      setNotice("");
    } catch { if (alive.current) setNotice("Chat couldn't refresh. Your draft is still here; try again."); }
    finally { inFlight.current = false; if (alive.current) setLoading(false); }
  }

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [token]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ready || !musician || busy || !body.trim()) return;
    setBusy(true);
    try {
      const result = await postJamChat(token, body);
      if (!result.ok) { setNotice(result.error); return; }
      if (result.message && result.message.channel !== "jam") { setNotice("The jam channel needs its backend update. Your draft has been kept."); return; }
      setBody("");
      setNotice(result.openRsvp ? "Open your invitation to update your RSVP." : result.botMessage?.body || "Posted to #wedding-jam.");
      if (result.message) setMessages((current) => [...current.filter((entry) => entry.id !== result.message!.id), result.message!]);
      if (result.botMessage?.channel === "jam") setMessages((current) => [...current, result.botMessage!]);
    } catch { setNotice("Couldn't confirm your message. Your draft is kept; refresh before retrying."); }
    finally { setBusy(false); }
  }

  async function saveHandle() {
    setBusy(true);
    try {
      const result = await setCommunityUsername(token, handle);
      if (!result.ok) { setNotice(result.error); return; }
      setHandle(result.profile.displayName);
      setNotice("Handle saved for both wedding channels.");
    } catch { setNotice("Couldn't save your handle. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="irc-panel jam-chat" aria-label="Musician notes and messages">
    <header className="irc-header"><strong>#wedding-jam</strong><span>{messages.length} messages</span><button type="button" className="inline-link" aria-label="Refresh musician messages" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? "is-spinning" : ""} /></button></header>
    <p className="jam-chat-intro">Song ideas, equipment plans, and notes for the band.</p>
    <div className="irc-messages" aria-live="polite" aria-busy={loading}>
      {!ready && loading && <p className="irc-empty">Opening the jam channel...</p>}
      {ready && messages.length === 0 && <p className="irc-empty">No notes yet. Who's bringing the extra mic stands?</p>}
      {messages.map((entry) => <ChatLine key={entry.id} entry={entry} />)}
    </div>
    {ready && musician && <>
      <div className="irc-handle"><label className="field"><span>Handle</span><input value={handle} maxLength={40} onChange={(event) => setHandle(event.target.value)} /></label><button type="button" className="secondary-action compact" disabled={busy || !handle.trim()} onClick={() => void saveHandle()}>Save</button></div>
      <form className="irc-compose" onSubmit={send}><textarea aria-label="Message the musicians" maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} placeholder="A note for the band, /help for commands" /><button type="submit" className="primary-action compact" disabled={busy || !body.trim()}><Send size={16} /> {busy ? "Sending..." : "Send"}</button></form>
    </>}
    {ready && !musician && <p className="jam-note">Turn on "I'm a musician" to join the band conversation.</p>}
    {notice && <p className="irc-notice" role="status">{notice}</p>}
  </section>;
}
