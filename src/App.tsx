import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ContactRow,
  Invite,
  RsvpStatus,
  fetchContactRows,
  fetchInvite,
  saveContactRow,
  submitRsvp,
} from "./lib/api";
import { HashRoute, readHashRoute, updateHash } from "./lib/hash";

type LoadState<T> =
  | { state: "idle" | "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

const RSVP_OPTIONS: Array<{ status: RsvpStatus; label: string; caption: string }> = [
  {
    status: "yes",
    label: "YES, I'M COMING",
    caption: "Save us a spot",
  },
  {
    status: "maybe",
    label: "MAYBE",
    caption: "I need a little time",
  },
  {
    status: "no",
    label: "NO, I CAN'T MAKE IT",
    caption: "Sending love from afar",
  },
];

export default function App() {
  const [route, setRoute] = useState<HashRoute>(() => readHashRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(readHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <main className="shell">
      <BackgroundArtwork />
      <header className="topbar" aria-label="Wedding RSVP header">
        <a className="brand" href="./">
          <span className="brand-mark" aria-hidden="true">
            S+E
          </span>
          <span>
            <strong>Sunyoung & Eric</strong>
            <small>October 30 RSVP</small>
          </span>
        </a>

      </header>

      {route.view === "contacts" ? (
        <ContactHelper initialAdminKey={route.adminKey} />
      ) : (
        <RsvpPage inviteToken={route.view === "rsvp" ? route.inviteToken : ""} />
      )}
    </main>
  );
}

function RsvpPage({ inviteToken }: { inviteToken: string }) {
  const [load, setLoad] = useState<LoadState<Invite>>({ state: inviteToken ? "loading" : "idle" });
  const [selected, setSelected] = useState<RsvpStatus | "">("");
  const [partnerComing, setPartnerComing] = useState(false);
  const [partnerNameOverride, setPartnerNameOverride] = useState("");
  const [showPartnerEdit, setShowPartnerEdit] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dm, setDm] = useState("");
  const [note, setNote] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    let alive = true;
    if (!inviteToken) {
      setLoad({ state: "idle" });
      return;
    }

    setLoad({ state: "loading" });
    fetchInvite(inviteToken)
      .then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setLoad({ state: "error", message: result.error });
          return;
        }
        setLoad({ state: "ready", data: result.invite });
        if (result.invite.lastResponse) {
          setSelected(result.invite.lastResponse.status);
          setPartnerComing(result.invite.lastResponse.partnerComing);
        }
      })
      .catch(() => {
        if (alive) setLoad({ state: "error", message: "We could not load this invite just now." });
      });
    return () => {
      alive = false;
    };
  }, [inviteToken]);

  const invite = load.state === "ready" ? load.data : undefined;
  const partnerName = partnerNameOverride.trim() || invite?.partnerName || "";
  const canSubmit = load.state === "ready" && selected !== "" && submitState !== "saving";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitState("saving");
    setSubmitMessage("");

    const result = await submitRsvp({
      token: inviteToken,
      status: selected,
      partnerComing,
      partnerNameOverride,
      email,
      phone,
      dm,
      note,
    });

    if (!result.ok) {
      setSubmitState("error");
      setSubmitMessage(result.error);
      return;
    }

    setSubmitState("done");
    setSubmitMessage(result.message);
  }

  return (
    <section className="rsvp-layout" aria-labelledby="rsvp-title">
      <div className="hero-copy">
        <p className="eyebrow">October 30 · venue count first</p>
        <h1 id="rsvp-title">Can you come celebrate with us?</h1>
        <p className="lede">
          Sunyoung and Eric are getting married, and we are planning a warm little party
          on October 30 with the people we love. A quick answer helps us choose the right venue size.
        </p>
        <div className="photo-slot" aria-label="Photo placeholder for Sunyoung and Eric">
          <div className="photo-card">
            <img src="./sunyoung-eric.jpeg" alt="Sunyoung and Eric by the water at sunset" />
          </div>
        </div>
      </div>

      <form className="rsvp-panel" onSubmit={onSubmit}>
        {load.state === "idle" && <MissingInvite />}
        {load.state === "loading" && <PanelMessage title="Loading your invite" tone="quiet" />}
        {load.state === "error" && <PanelMessage title={load.message} tone="error" />}
        {load.state === "ready" && (
          <>
            <div className="invite-heading">
              <p>Hi {invite!.householdLabel}</p>
              <h2>{invite!.primaryName}, can you make it?</h2>
            </div>

            <fieldset className="choice-grid">
              <legend>Your RSVP</legend>
              {RSVP_OPTIONS.map((option) => (
                <label
                  className={`choice-card ${selected === option.status ? "is-selected" : ""}`}
                  key={option.status}
                >
                  <input
                    type="radio"
                    name="rsvp"
                    value={option.status}
                    checked={selected === option.status}
                    onChange={() => setSelected(option.status)}
                  />
                  <span>{option.label}</span>
                  <small>{option.caption}</small>
                </label>
              ))}
            </fieldset>

            {invite!.partnerName && (
              <div className="partner-box">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={partnerComing}
                    onChange={(event) => setPartnerComing(event.target.checked)}
                  />
                  <span>{partnerName} is also coming</span>
                </label>
                <button
                  className="inline-link"
                  type="button"
                  onClick={() => setShowPartnerEdit((value) => !value)}
                >
                  partner name needs a tweak?
                </button>
                {showPartnerEdit && (
                  <label className="field">
                    <span>Partner name</span>
                    <input
                      value={partnerNameOverride}
                      onChange={(event) => setPartnerNameOverride(event.target.value)}
                      placeholder={invite!.partnerName}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="field-grid">
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="best email"
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="best text number"
                />
              </label>
              <label className="field field-wide">
                <span>DM or note</span>
                <input
                  value={dm}
                  onChange={(event) => setDm(event.target.value)}
                  placeholder="@handle, WhatsApp, KakaoTalk, etc."
                />
              </label>
              <label className="field field-wide">
                <span>Anything we should know?</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Timing, travel, venue notes, or a tiny cheer."
                />
              </label>
            </div>

            <button className="primary-action" disabled={!canSubmit} type="submit">
              {submitState === "saving" ? "Saving..." : "Send RSVP"}
            </button>
            {submitState === "done" && (
              <p className="success-message">
                Thank you. That helps us choose the venue with a little more confidence.
              </p>
            )}
            {submitState === "error" && <p className="error-message">{submitMessage}</p>}
          </>
        )}
      </form>
    </section>
  );
}

function MissingInvite() {
  const [token, setToken] = useState("");

  return (
    <div className="missing-invite">
      <p className="eyebrow">personal link needed</p>
      <h2>Open the invite link we sent you.</h2>
      <p>
        Your private link lets this page greet you by name without showing the guest
        list publicly. For a local preview, use the demo invite.
      </p>
      <div className="token-row">
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="paste invite code"
          aria-label="Invite code"
        />
        <button type="button" onClick={() => updateHash({ invite: token || "demo" })}>
          open
        </button>
      </div>
      <button className="inline-link" type="button" onClick={() => updateHash({ invite: "demo" })}>
        preview with demo invite
      </button>
    </div>
  );
}

function ContactHelper({ initialAdminKey }: { initialAdminKey: string }) {
  const [adminKey, setAdminKey] = useState(initialAdminKey);
  const [helperName, setHelperName] = useState("");
  const [load, setLoad] = useState<LoadState<ContactRow[]>>({ state: "idle" });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (initialAdminKey) void loadRows(initialAdminKey);
  }, [initialAdminKey]);

  async function loadRows(key = adminKey) {
    if (!key) return;
    setLoad({ state: "loading" });
    const result = await fetchContactRows(key);
    if (!result.ok) {
      setLoad({ state: "error", message: result.error });
      return;
    }
    setLoad({ state: "ready", data: result.rows });
  }

  const rows = load.state === "ready" ? load.data : [];
  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.householdLabel,
        row.primaryName,
        row.partnerName,
        row.email,
        row.phone,
        row.dm,
        row.contactStatus,
        row.suggestion,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [filter, rows]);

  function replaceRow(nextRow: ContactRow) {
    setLoad((current) => {
      if (current.state !== "ready") return current;
      return {
        state: "ready",
        data: current.data.map((row) =>
          row.householdId === nextRow.householdId
            ? { ...row, ...nextRow, householdLabel: row.householdLabel || nextRow.householdLabel }
            : row,
        ),
      };
    });
  }

  return (
    <section className="admin-layout" aria-labelledby="contacts-title">
      <div className="admin-hero">
        <p className="eyebrow">private helper page</p>
        <h1 id="contacts-title">Fill in the ways to reach everyone.</h1>
        <p>
          This page is for Eric, Sunyoung, Sia, and Seijin. It keeps contact details
          behind the Apps Script admin key and only saves the fields needed to send invites.
        </p>
        <div className="admin-controls">
          <label className="field">
            <span>Admin key</span>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="not stored in the repo"
            />
          </label>
          <label className="field">
            <span>Your name</span>
            <input
              value={helperName}
              onChange={(event) => setHelperName(event.target.value)}
              placeholder="Eric, Sunyoung, Sia, or Seijin"
            />
          </label>
          <button className="primary-action compact" type="button" onClick={() => loadRows()}>
            Load contacts
          </button>
        </div>
      </div>

      <div className="admin-list">
        <div className="list-toolbar">
          <strong>{visibleRows.length || 0} households</strong>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="filter names or contact status"
            aria-label="Filter contact rows"
          />
        </div>
        {load.state === "idle" && (
          <PanelMessage title="Enter the admin key to load private contact rows." tone="quiet" />
        )}
        {load.state === "loading" && <PanelMessage title="Loading contact rows" tone="quiet" />}
        {load.state === "error" && <PanelMessage title={load.message} tone="error" />}
        {load.state === "ready" && (
          <div className="contact-cards">
            {visibleRows.map((row) => (
              <ContactCard
                adminKey={adminKey}
                helperName={helperName}
                key={row.householdId}
                row={row}
                onSaved={replaceRow}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ContactCard({
  adminKey,
  helperName,
  row,
  onSaved,
}: {
  adminKey: string;
  helperName: string;
  row: ContactRow;
  onSaved: (row: ContactRow) => void;
}) {
  const [draft, setDraft] = useState(row);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareFeedback, setShareFeedback] = useState("");

  useEffect(() => setDraft(row), [row]);

  const inviteUrl = buildInviteUrl(row.inviteToken);
  const shareMethod = draft.shareMethod || methodFromPreference(draft.contactPreference);
  const responseLabel = draft.rsvpStatus === "waiting" ? "waiting for RSVP" : `RSVP: ${draft.rsvpStatus}`;

  async function save(nextDraft = draft) {
    setStatus("saving");
    const result = await saveContactRow({
      adminKey,
      helperName,
      householdId: row.householdId,
      email: nextDraft.email,
      phone: nextDraft.phone,
      dm: nextDraft.dm,
      contactPreference: nextDraft.contactPreference,
      contactSource: nextDraft.contactSource,
      contactStatus: nextDraft.contactStatus,
      detailsConfirmed: nextDraft.detailsConfirmed,
      householdType: nextDraft.householdType,
      shareMethod: nextDraft.shareMethod,
      shareStatus: nextDraft.shareStatus,
      lastSharedAt: nextDraft.lastSharedAt,
    });
    if (!result.ok) {
      setStatus("error");
      return;
    }
    onSaved({ ...nextDraft, ...result.row });
    setStatus("saved");
  }

  async function shareInvite() {
    const method = shareMethod || "copy";
    const message = makeShareMessage(row, inviteUrl);
    const nextDraft: ContactRow = {
      ...draft,
      shareMethod: method,
      shareStatus: "sent",
      lastSharedAt: new Date().toISOString(),
      contactStatus: draft.contactStatus === "do not send" ? draft.contactStatus : "sent",
    };
    setDraft(nextDraft);
    setShareFeedback("");

    if (method === "email") {
      const subject = encodeURIComponent("Sunyoung & Eric October 30 wedding party RSVP");
      const body = encodeURIComponent(message);
      window.open(`mailto:${draft.email}?subject=${subject}&body=${body}`, "_blank", "noopener,noreferrer");
      setShareFeedback("Opened email draft and marked as sent.");
    } else if (method === "text") {
      const body = encodeURIComponent(message);
      window.open(`sms:${draft.phone}?&body=${body}`, "_blank", "noopener,noreferrer");
      setShareFeedback("Opened text message and marked as sent.");
    } else if (method === "dm" && /^https?:\/\//i.test(draft.dm)) {
      window.open(draft.dm, "_blank", "noopener,noreferrer");
      await copyShareText(message);
      setShareFeedback("Opened DM link and copied the message.");
    } else {
      await copyShareText(message);
      setShareFeedback("Invite message copied. Paste it into your DM or chat app.");
    }

    await save(nextDraft);
  }

  return (
    <article className="contact-card">
      <div className="contact-card-heading">
        <div>
          <h2>{row.householdLabel}</h2>
          <p>
            {row.primaryName}
            {row.partnerName ? ` + ${row.partnerName}` : ""}
          </p>
        </div>
        <div className="status-stack" aria-label="Invite status">
          <span className="status-pill">{draft.contactStatus || "needs contact"}</span>
          <span className={`status-pill ${draft.shareStatus === "sent" ? "sent" : "waiting"}`}>
            {draft.shareStatus || "not shared"}
          </span>
          <span className={`status-pill ${draft.rsvpStatus === "waiting" ? "waiting" : "responded"}`}>
            {responseLabel}
          </span>
        </div>
      </div>
      {row.suggestion && <p className="suggestion">{row.suggestion}</p>}
      <div className="confirm-row">
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.detailsConfirmed}
            onChange={(event) => setDraft({ ...draft, detailsConfirmed: event.target.checked })}
          />
          <span>details confirmed</span>
        </label>
        <label className="field compact-field">
          <span>Household</span>
          <select
            value={draft.householdType || "unknown"}
            onChange={(event) =>
              setDraft({ ...draft, householdType: event.target.value as ContactRow["householdType"] })
            }
          >
            <option value="unknown">confirm</option>
            <option value="couple">couple</option>
            <option value="single">single</option>
          </select>
        </label>
      </div>
      <div className="field-grid tight">
        <label className="field">
          <span>Email</span>
          <input
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Phone</span>
          <input
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
        </label>
        <label className="field">
          <span>DM</span>
          <input
            value={draft.dm}
            onChange={(event) => setDraft({ ...draft, dm: event.target.value })}
            placeholder="@handle or profile link"
          />
        </label>
        <label className="field">
          <span>Preference</span>
          <select
            value={draft.contactPreference}
            onChange={(event) => setDraft({ ...draft, contactPreference: event.target.value })}
          >
            <option value="">choose</option>
            <option value="text">text</option>
            <option value="email">email</option>
            <option value="dm">dm</option>
            <option value="ask someone">ask someone</option>
          </select>
        </label>
        <label className="field">
          <span>Source</span>
          <input
            value={draft.contactSource}
            onChange={(event) => setDraft({ ...draft, contactSource: event.target.value })}
            placeholder="Eric contacts, Sunyoung phone, etc."
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={draft.contactStatus}
            onChange={(event) => setDraft({ ...draft, contactStatus: event.target.value })}
          >
            <option value="needs contact">needs contact</option>
            <option value="matched">matched</option>
            <option value="verified">verified</option>
            <option value="sent">sent</option>
            <option value="do not send">do not send</option>
          </select>
        </label>
        <label className="field">
          <span>Share by</span>
          <select
            value={draft.shareMethod || methodFromPreference(draft.contactPreference)}
            onChange={(event) =>
              setDraft({ ...draft, shareMethod: event.target.value as ContactRow["shareMethod"] })
            }
          >
            <option value="copy">copy link</option>
            <option value="text">text</option>
            <option value="email">email</option>
            <option value="dm">dm</option>
          </select>
        </label>
        <label className="field">
          <span>Last shared</span>
          <input value={formatDate(draft.lastSharedAt) || "not yet"} readOnly />
        </label>
      </div>
      <div className="share-box">
        <div>
          <strong>Private RSVP link</strong>
          <p>{draft.shareStatus === "sent" ? "Already marked sent." : "Ready to send when details look right."}</p>
        </div>
        <button className="secondary-action" type="button" onClick={shareInvite} disabled={status === "saving"}>
          Share link
        </button>
      </div>
      <button className="secondary-action" type="button" onClick={() => save()} disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save contact"}
      </button>
      {shareFeedback && <p className="mini-success">{shareFeedback}</p>}
      {status === "saved" && <p className="mini-success">Saved.</p>}
      {status === "error" && <p className="error-message">Could not save this row.</p>}
    </article>
  );
}

function buildInviteUrl(token: string) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#invite=${encodeURIComponent(token)}`;
}

function methodFromPreference(preference: string): ContactRow["shareMethod"] {
  if (preference === "text" || preference === "email" || preference === "dm") return preference;
  return "copy";
}

function makeShareMessage(row: ContactRow, inviteUrl: string) {
  return `Sunyoung and Eric are getting married, and we would love to know if ${row.householdLabel} can come celebrate with us on October 30. Please RSVP here: ${inviteUrl}`;
}

async function copyShareText(message: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return;
  }
  window.prompt("Copy this invite message", message);
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PanelMessage({ title, tone }: { title: string; tone: "quiet" | "error" }) {
  return (
    <div className={`panel-message ${tone}`}>
      <h2>{title}</h2>
    </div>
  );
}

function BackgroundArtwork() {
  return (
    <div className="artwork" aria-hidden="true">
      <div className="ribbon one" />
      <div className="ribbon two" />
      <div className="ticket-lines" />
    </div>
  );
}
