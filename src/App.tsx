import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminResponse,
  ContactRow,
  Invite,
  RsvpStatus,
  fetchContactRows,
  fetchResponses,
  fetchInvite,
  saveContactRow,
  splitContactRow,
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
        setEmail(result.invite.email || "");
        setPhone(result.invite.phone || "");
        setDm(result.invite.dm || "");
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

    try {
      const result = await submitRsvp({ token: inviteToken, status: selected, partnerComing, partnerNameOverride, email, phone, dm, note });
      if (!result.ok) { setSubmitState("error"); setSubmitMessage(result.error); return; }
      setSubmitState("done");
      setSubmitMessage(result.message);
    } catch {
      setSubmitState("error");
      setSubmitMessage("We could not save that RSVP just now. Please try again.");
    }
  }

  return (
    <section className="rsvp-layout" aria-labelledby="rsvp-title">
      <div className="hero-copy">
        <p className="eyebrow"><strong>October 30, 7–11 PM</strong> · Hamilton area</p>
        <h1 id="rsvp-title">Can you come celebrate with us?</h1>
        <p className="lede">
          Sunyoung and Eric are getting married, and we are planning a warm little party
          in the Hamilton area on <strong>October 30, 7–11 PM</strong> with music, dancing, food, and friends. A quick answer helps us choose the right venue size.
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
        {load.state === "ready" && (submitState === "done" ? (
          <ThankYou name={invite!.primaryName} onEdit={() => setSubmitState("idle")} />
        ) : (
          <>
            <div className="invite-heading">
              <p>Hi {invite!.householdLabel}</p>
              <h2>{invite!.primaryName}, can you make it?</h2>
            </div>

            <fieldset className="choice-grid">
              <legend>Your RSVP</legend>
              {RSVP_OPTIONS.map((option) => (
                <label
                  className={`choice-card choice-${option.status} ${selected === option.status ? "is-selected" : ""}`}
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
                  <small>{option.status === "yes" && !invite!.partnerName ? "Save me a spot" : option.caption}</small>
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

            <section className="contact-update-group" aria-label="Optional contact updates">
              <div className="contact-update-heading"><strong>Optional contact updates</strong><span>Only if something has changed</span></div>
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
            </section>

            <button className="primary-action" disabled={!canSubmit} type="submit">
              {submitState === "saving" ? "Saving..." : "Send RSVP"}
            </button>
            {submitState === "error" && <p className="error-message">{submitMessage}</p>}
          </>
        ))}
      </form>
    </section>
  );
}


function ThankYou({ name, onEdit }: { name: string; onEdit: () => void }) {
  function leaveInvite() {
    window.close();
    window.setTimeout(() => window.location.replace("about:blank"), 120);
  }

  return (
    <div className="thanks-screen">
      <div>
        <p className="eyebrow">RSVP received</p>
        <h2>Thank you, {name}.</h2>
        <p>Your answer is saved. It helps us choose a Hamilton-area venue with room for everyone.</p>
        <div className="thanks-actions">
          <button className="primary-action" type="button" onClick={leaveInvite}>Close invite</button>
          <button className="secondary-action" type="button" onClick={onEdit}>Edit my response</button>
        </div>
      </div>
    </div>
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
  const [contactSort, setContactSort] = useState<"needs-contact" | "contacted" | "name">("needs-contact");
  const [adminView, setAdminView] = useState<"contacts" | "responses">("contacts");
  const [responses, setResponses] = useState<LoadState<AdminResponse[]>>({ state: "idle" });

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
    void fetchResponses(key).then((responseResult) => {
      if (responseResult.ok) setResponses({ state: "ready", data: responseResult.responses });
    });
  }

  async function loadResponses() {
    if (!adminKey) return;
    setResponses({ state: "loading" });
    const result = await fetchResponses(adminKey);
    if (!result.ok) { setResponses({ state: "error", message: result.error }); return; }
    setResponses({ state: "ready", data: result.responses });
  }

  function showResponses() {
    setAdminView("responses");
    void loadResponses();
  }
  useEffect(() => {
    if (!adminKey || (adminView === "contacts" && load.state !== "ready")) return;
    const timer = window.setInterval(() => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
      if (adminView === "responses") {
        void fetchResponses(adminKey).then((result) => {
          if (result.ok) setResponses({ state: "ready", data: result.responses });
        });
        return;
      }
      void Promise.all([fetchContactRows(adminKey), fetchResponses(adminKey)]).then(([contactResult, responseResult]) => {
        if (contactResult.ok) setLoad({ state: "ready", data: contactResult.rows });
        if (responseResult.ok) setResponses({ state: "ready", data: responseResult.responses });
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, [adminKey, adminView, load.state]);
  const rows = load.state === "ready" ? load.data : [];
  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = !needle ? rows : rows.filter((row) =>
      [row.householdLabel, row.primaryName, row.partnerName, row.email, row.phone, row.dm, row.contactStatus, row.suggestion]
        .join(" ").toLowerCase().includes(needle),
    );
    return [...matches].sort((left, right) => {
      if (contactSort === "name") return left.householdLabel.localeCompare(right.householdLabel);
      const contactedCount = (row: ContactRow) => Number(row.primaryContacted) + Number(Boolean(row.partnerName) && row.partnerContacted);
      const difference = contactedCount(left) - contactedCount(right);
      return contactSort === "needs-contact" ? difference : -difference;
    });
  }, [contactSort, filter, rows]);

  function splitRows(nextRow: ContactRow, created: ContactRow) {
    setLoad((current) => {
      if (current.state !== "ready") return current;
      return { state: "ready", data: [...current.data.map((row) => row.householdId === nextRow.householdId ? nextRow : row), created] };
    });
  }

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
          <strong>{adminView === "contacts" ? `${visibleRows.length || 0} households` : "RSVP responses"}</strong><span className="live-indicator">Live updates every 20s</span>
          <div className="view-switch" aria-label="Choose admin view">
            <button className={adminView === "contacts" ? "is-active" : ""} type="button" onClick={() => setAdminView("contacts")}>Contacts</button>
            <button className={adminView === "responses" ? "is-active" : ""} type="button" onClick={showResponses}>Responses</button>
          </div>
          {adminView === "contacts" ? <><select className="contact-sort" value={contactSort} onChange={(event) => setContactSort(event.target.value as "needs-contact" | "contacted" | "name")} aria-label="Sort households"><option value="needs-contact">Yet to contact first</option><option value="contacted">Contacted first</option><option value="name">Name A-Z</option></select><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="filter names or contact status" aria-label="Filter contact rows" /></> : <button className="secondary-action compact" type="button" onClick={() => void loadResponses()}>Refresh replies</button>}
        </div>
        {adminView === "responses" ? <ResponseList load={responses} onReload={() => void loadResponses()} /> : <>
          {load.state === "ready" && <ContactSummary rows={rows} responses={responses} />}
          {load.state === "idle" && <PanelMessage title="Enter the admin key to load private contact rows." tone="quiet" />}
          {load.state === "loading" && <PanelMessage title="Loading contact rows" tone="quiet" />}
          {load.state === "error" && <PanelMessage title={load.message} tone="error" />}
          {load.state === "ready" && <div className="contact-cards">{visibleRows.map((row) => <ContactCard adminKey={adminKey} helperName={helperName} key={row.householdId} row={row} onSaved={replaceRow} onSplit={splitRows} />)}</div>}
        </>}
      </div>
    </section>
  );
}


function ContactSummary({ rows, responses }: { rows: ContactRow[]; responses: LoadState<AdminResponse[]> }) {
  const people = rows.reduce((total, row) => total + 1 + (row.partnerName ? 1 : 0), 0);
  const contacted = rows.reduce((total, row) => total + Number(row.primaryContacted) + Number(Boolean(row.partnerName) && row.partnerContacted), 0);
  const householdResponses = responses.state === "ready" ? latestHouseholdResponses(responses.data) : [];
  const confirmedPeople = householdResponses.reduce((total, response) => total + response.confirmedPeople, 0);
  return <div className="admin-summary"><strong>{contacted} of {people} people contacted</strong><span>{confirmedPeople} people confirmed</span><span>{householdResponses.length} households replied</span></div>;
}

type HouseholdResponseSummary = {
  householdId: string;
  householdLabel: string;
  primaryName: string;
  partnerName: string;
  status: RsvpStatus;
  confirmedPeople: number;
  submittedAt: string;
  note: string;
  responderName: string;
};

function latestHouseholdResponses(responses: AdminResponse[]): HouseholdResponseSummary[] {
  const groups = new Map<string, { primary?: AdminResponse; partner?: AdminResponse }>();
  for (const response of responses) {
    const key = response.householdId || response.householdLabel;
    const group = groups.get(key) ?? {};
    const role = response.responderRole === "partner" ? "partner" : "primary";
    const current = group[role];
    if (!current || Date.parse(response.submittedAt) > Date.parse(current.submittedAt)) group[role] = response;
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => {
    const primary = group.primary;
    const partner = group.partner;
    const latest = [primary, partner].filter((response): response is AdminResponse => Boolean(response))
      .sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt))[0];
    const isCouple = Boolean(latest.partnerName);
    const primaryComing = primary?.status === "yes" || Boolean(partner?.partnerComing);
    const partnerComing = isCouple && (partner?.status === "yes" || Boolean(primary?.partnerComing));
    const confirmedPeople = Number(primaryComing) + Number(partnerComing);
    return {
      householdId: latest.householdId || latest.householdLabel,
      householdLabel: latest.householdLabel,
      primaryName: latest.primaryName,
      partnerName: latest.partnerName,
      status: confirmedPeople > 0 ? "yes" : latest.status,
      confirmedPeople,
      submittedAt: latest.submittedAt,
      note: latest.note,
      responderName: latest.responderName || latest.primaryName,
    };
  }).sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt));
}

function ResponseList({ load, onReload }: { load: LoadState<AdminResponse[]>; onReload: () => void }) {
  const [filter, setFilter] = useState<"all" | "messages" | RsvpStatus>("all");
  if (load.state === "loading") return <PanelMessage title="Loading RSVP responses" tone="quiet" />;
  if (load.state === "error") return <PanelMessage title={load.message} tone="error" />;
  if (load.state !== "ready") return <button className="secondary-action" type="button" onClick={onReload}>Load responses</button>;
  if (!load.data.length) return <PanelMessage title="No RSVP responses yet." tone="quiet" />;
  const latest = latestHouseholdResponses(load.data);
  const totals = latest.reduce<Record<RsvpStatus, number>>((count, response) => ({ ...count, [response.status]: count[response.status] + 1 }), { yes: 0, maybe: 0, no: 0 });
  const visible = filter === "all" ? latest : filter === "messages" ? latest.filter((response) => Boolean(response.note.trim())) : latest.filter((response) => response.status === filter);
  const attending = latest.reduce((total, response) => total + response.confirmedPeople, 0);
  const messages = latest.filter((response) => Boolean(response.note.trim())).length;
  const responseCopy: Record<RsvpStatus, string> = { yes: "Coming", maybe: "Maybe", no: "Cannot make it" };

  return <section className="rsvp-board" aria-label="RSVP responses">
    <div className="rsvp-board-header"><div><p className="eyebrow">latest replies</p><h2>RSVPs</h2></div><span className="response-total">{latest.length} replied <span aria-hidden="true">&middot;</span> {attending} people coming</span></div>
    <div className="response-stats" aria-label="RSVP summary"><span className="yes">Coming <strong>{totals.yes}</strong></span><span className="maybe">Maybe <strong>{totals.maybe}</strong></span><span className="no">Cannot make it <strong>{totals.no}</strong></span><span>Messages <strong>{messages}</strong></span></div>
    <div className="response-filters" aria-label="Filter RSVP responses">
      <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All <span>{latest.length}</span></button>
      <button type="button" className={`yes ${filter === "yes" ? "is-active" : ""}`} onClick={() => setFilter("yes")}>Coming <span>{totals.yes}</span></button>
      <button type="button" className={`maybe ${filter === "maybe" ? "is-active" : ""}`} onClick={() => setFilter("maybe")}>Maybe <span>{totals.maybe}</span></button>
      <button type="button" className={`no ${filter === "no" ? "is-active" : ""}`} onClick={() => setFilter("no")}>Cannot make it <span>{totals.no}</span></button>
      <button type="button" className={`messages ${filter === "messages" ? "is-active" : ""}`} onClick={() => setFilter("messages")}>Messages <span>{messages}</span></button>
    </div>
    <div className="response-list">{visible.map((response) => {
      const isCouple = Boolean(response.partnerName);
      return <article className={`response-card status-${response.status}`} key={response.householdId}>
        <div className="response-main"><div className="response-heading"><div><h3>{response.primaryName}{isCouple ? ` & ${response.partnerName}` : ""}</h3><p>{isCouple ? "Couple" : "Individual"} <span aria-hidden="true">&middot;</span> {formatDate(response.submittedAt)}</p></div><span className="response-status">{responseCopy[response.status]}</span></div>{response.status === "yes" && <p className="attendance-line">{response.confirmedPeople} {response.confirmedPeople === 1 ? "person is" : "people are"} coming</p>}</div>
        {response.note && <div className="response-note"><span>Message from {response.responderName}</span><p>{response.note}</p></div>}
      </article>;
    })}</div>
  </section>;
}

function ContactCard({
  adminKey,
  helperName,
  row,
  onSaved,
  onSplit,
}: {
  adminKey: string;
  helperName: string;
  row: ContactRow;
  onSaved: (row: ContactRow) => void;
  onSplit: (row: ContactRow, created: ContactRow) => void;
}) {
  const [draft, setDraft] = useState(row);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  useEffect(() => setDraft(row), [row]);

  async function splitHousehold() {
    if (!draft.partnerName) return;
    setStatus("saving");
    const result = await splitContactRow({ adminKey, helperName, householdId: draft.householdId });
    if (!result.ok) { setStatus("error"); return; }
    setDraft(result.row);
    onSplit(result.row, result.created);
    setStatus("saved");
    setFeedback(`${result.created.primaryName} is now a separate guest with their own private link.`);
  }

  async function save(nextDraft = draft) {
    setStatus("saving");
    const result = await saveContactRow({
      adminKey, helperName, householdId: row.householdId,
      email: nextDraft.primaryEmail, phone: nextDraft.primaryPhone, dm: nextDraft.primaryDm,
      contactPreference: nextDraft.primaryContactPreference, contactSource: nextDraft.primaryContactSource,
      contactStatus: nextDraft.contactStatus, detailsConfirmed: nextDraft.detailsConfirmed, householdType: nextDraft.householdType,
      shareMethod: nextDraft.shareMethod, shareStatus: nextDraft.shareStatus, lastSharedAt: nextDraft.lastSharedAt,
      primaryEmail: nextDraft.primaryEmail, primaryPhone: nextDraft.primaryPhone, primaryDm: nextDraft.primaryDm,
      primaryContactPreference: nextDraft.primaryContactPreference, primaryContactSource: nextDraft.primaryContactSource,
      primaryContacted: nextDraft.primaryContacted, primaryLastContactedAt: nextDraft.primaryLastContactedAt,
      partnerEmail: nextDraft.partnerEmail, partnerPhone: nextDraft.partnerPhone, partnerDm: nextDraft.partnerDm,
      partnerContactPreference: nextDraft.partnerContactPreference, partnerContactSource: nextDraft.partnerContactSource,
      partnerContacted: nextDraft.partnerContacted, partnerLastContactedAt: nextDraft.partnerLastContactedAt,
    });
    if (!result.ok) { setStatus("error"); return; }
    onSaved({ ...nextDraft, ...result.row });
    setStatus("saved");
  }

  async function copyLink(personName: string, token: string) {
    await copyShareText(buildInviteUrl(token));
    setFeedback(`${personName}'s RSVP link copied.`);
  }

  async function shareInvite(personName: string, token: string, method: ContactRow["shareMethod"], email: string, phone: string, dm: string) {
    const inviteUrl = buildInviteUrl(token);
    const message = makeShareMessage(personName, inviteUrl);
    const canUseMobileShare = window.matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function";
    if (canUseMobileShare) {
      try {
        await navigator.share({ title: "Sunyoung & Eric's wedding party", text: "Sunyoung and Eric are getting married. Please RSVP for October 30.", url: inviteUrl });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") { setFeedback("Share cancelled."); return; }
        await copyShareText(message);
        setFeedback(`${personName}'s invite was copied instead.`);
      }
    } else if (method === "email") {
      const subject = encodeURIComponent("Sunyoung & Eric October 30 wedding party RSVP");
      window.open(`mailto:${email}?subject=${subject}&body=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } else if (method === "text") {
      window.open(`sms:${phone}?&body=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    } else if (method === "dm" && /^https?:\/\//i.test(dm)) {
      window.open(dm, "_blank", "noopener,noreferrer");
      await copyShareText(message);
    } else {
      await copyShareText(message);
    }
    const nextDraft = { ...draft, shareMethod: method || "copy", shareStatus: "sent", lastSharedAt: new Date().toISOString(), contactStatus: draft.contactStatus === "do not send" ? draft.contactStatus : "sent" };
    setDraft(nextDraft);
    setFeedback(`Ready to send ${personName}'s invite.`);
    await save(nextDraft);
  }

  const householdHasBeenContacted = Boolean(draft.primaryContacted || (draft.partnerName && draft.partnerContacted));
  const responseLabel = draft.rsvpStatus === "waiting" ? householdHasBeenContacted ? "Waiting for RSVP" : "Invite not sent" : `RSVP: ${draft.rsvpStatus}`;
  const responseClass = draft.rsvpStatus === "waiting" ? householdHasBeenContacted ? "waiting" : "not-sent" : "responded";
  const people = [
    { key: "primary" as const, name: draft.primaryName, token: draft.primaryInviteToken || draft.inviteToken, email: draft.primaryEmail, phone: draft.primaryPhone, dm: draft.primaryDm, preference: draft.primaryContactPreference, source: draft.primaryContactSource, contacted: draft.primaryContacted, contactedAt: draft.primaryLastContactedAt },
    ...(draft.partnerName ? [{ key: "partner" as const, name: draft.partnerName, token: draft.partnerInviteToken, email: draft.partnerEmail, phone: draft.partnerPhone, dm: draft.partnerDm, preference: draft.partnerContactPreference, source: draft.partnerContactSource, contacted: draft.partnerContacted, contactedAt: draft.partnerLastContactedAt }] : []),
  ];

  function updatePerson(key: "primary" | "partner", field: "Email" | "Phone" | "Dm" | "ContactPreference" | "ContactSource", value: string) {
    const prefix = key === "primary" ? "primary" : "partner";
    setDraft({ ...draft, [`${prefix}${field}`]: value } as ContactRow);
  }

  function toggleContacted(key: "primary" | "partner", checked: boolean) {
    const prefix = key === "primary" ? "primary" : "partner";
    const nextDraft = { ...draft, [`${prefix}Contacted`]: checked, [`${prefix}LastContactedAt`]: checked ? new Date().toISOString() : "" } as ContactRow;
    setDraft(nextDraft);
    void save(nextDraft);
  }

  return (
    <details className="contact-card">
      <summary className="household-summary">
        <div><strong>{row.householdLabel}</strong><span>{row.primaryName}{row.partnerName ? ` + ${row.partnerName}` : ""}</span></div>
        <div className="status-stack"><span className={`status-pill ${responseClass}`}>{responseLabel}</span><span className="disclosure-arrow" aria-hidden="true" /></div>
      </summary>
      <div className="household-details">
        {row.suggestion && <p className="suggestion">{row.suggestion}</p>}
        <div className="confirm-row">
          <label className="check-row"><input type="checkbox" checked={draft.detailsConfirmed} onChange={(event) => setDraft({ ...draft, detailsConfirmed: event.target.checked })} /><span>household details confirmed</span></label>
          <label className="field compact-field"><span>Household</span><select value={draft.householdType || "unknown"} onChange={(event) => { const value = event.target.value as ContactRow["householdType"]; if (value === "single" && draft.partnerName) void splitHousehold(); else setDraft({ ...draft, householdType: value }); }}><option value="unknown">confirm</option><option value="couple">couple</option><option value="single">single</option></select></label>
        </div>
        <div className="person-cards">
          {people.map((person) => {
            const method = methodFromPreference(person.preference);
            return <details className="person-card" key={person.key}>
              <summary className="person-summary">
                <strong>{person.name}</strong>
                <label className={`contact-toggle ${person.contacted ? "is-contacted" : ""}`} onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" role="switch" checked={person.contacted} onChange={(event) => toggleContacted(person.key, event.target.checked)} aria-label={`${person.name}: ${person.contacted ? "contacted" : "not contacted"}`} />
                  <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span><span>{person.contacted ? "Contacted" : "Not contacted"}</span>
                </label>
                <button className="secondary-action compact desktop-only" type="button" onClick={(event) => { event.stopPropagation(); void copyLink(person.name, person.token); }}>Copy link</button>
                <button className="secondary-action compact share-action mobile-only" type="button" onClick={(event) => { event.stopPropagation(); void shareInvite(person.name, person.token, method, person.email, person.phone, person.dm); }} disabled={status === "saving"}>Share link</button>
                <span className="disclosure-arrow" aria-hidden="true" />
              </summary>
              <div className="person-details">
                <div className="link-row"><input value={buildInviteUrl(person.token)} readOnly aria-label={`${person.name} private RSVP link`} /></div>
                <div className="field-grid tight">
                  <label className="field"><span>Email</span><input type="email" value={person.email} onChange={(event) => updatePerson(person.key, "Email", event.target.value)} placeholder="name@example.com" /></label>
                  <label className="field"><span>Phone</span><input type="tel" value={person.phone} onChange={(event) => updatePerson(person.key, "Phone", event.target.value)} placeholder="phone number" /></label>
                  <label className="field"><span>DM</span><input value={person.dm} onChange={(event) => updatePerson(person.key, "Dm", event.target.value)} placeholder="handle or link" /></label>
                  <label className="field"><span>Preferred contact</span><select value={person.preference} onChange={(event) => updatePerson(person.key, "ContactPreference", event.target.value)}><option value="">choose</option><option value="text">text</option><option value="email">email</option><option value="dm">DM</option><option value="ask someone">ask someone</option></select></label>
                  <label className="field field-wide"><span>Source</span><input value={person.source} onChange={(event) => updatePerson(person.key, "ContactSource", event.target.value)} placeholder="Eric contacts, Sunyoung phone, etc." /></label>
                </div>
                <div className="person-actions"><button className="secondary-action share-action desktop-only" type="button" onClick={() => void shareInvite(person.name, person.token, method, person.email, person.phone, person.dm)} disabled={status === "saving"}>Share link</button>{person.contactedAt && <small>Marked contacted {formatDate(person.contactedAt)}</small>}</div>
              </div>
            </details>;
          })}
        </div>
        <button className="secondary-action" type="button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving..." : "Save household"}</button>
        {feedback && <p className="mini-success">{feedback}</p>}
        {status === "saved" && <p className="mini-success">Saved.</p>}
        {status === "error" && <p className="error-message">Could not save this household.</p>}
      </div>
    </details>
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

function makeShareMessage(personName: string, inviteUrl: string) {
  return `Sunyoung and Eric are getting married, and we would love to know if ${personName} can come celebrate with us on October 30. Please RSVP here: ${inviteUrl}`;
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
