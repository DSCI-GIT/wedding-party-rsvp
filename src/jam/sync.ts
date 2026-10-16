import type { Claim, JamState, Result } from "./api";
import { isJamState } from "./state";

export type MusicChange = { action: string; songId?: string; role?: string; selected?: boolean; enabled?: boolean; artist?: string; expectedRevision?: number };
type PendingChange = MusicChange & { revision: number };
type Batch = { clientId: string; revision: number; changes: MusicChange[] };
type Snapshot = { state?: JamState; pending: number; syncing: boolean; refreshing: boolean; loading: boolean; error: string; localError: string; updatedAt: string };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Transport = (action: string, values?: Record<string, unknown>) => Promise<Result<{ state: JamState; ackRevision?: number }>>;

export function optimisticState(base: JamState, changes: MusicChange[]): JamState {
  const state = { ...base, viewer: { ...base.viewer }, members: [...base.members], claims: [...base.claims], choices: { ...base.choices }, votes: { ...base.votes }, myVotes: [...base.myVotes] };
  let ownClaims = [...(base.ownClaims || base.claims.filter((claim) => claim.memberId === base.viewer.id))];
  for (const change of changes) {
    if (change.action === "participation") state.viewer.enabled = Boolean(change.enabled);
    if (change.action === "vote" && change.songId) {
      const before = state.myVotes.includes(change.songId), after = Boolean(change.selected);
      if (before !== after) {
        state.votes[change.songId] = Math.max(0, (state.votes[change.songId] || 0) + (after ? 1 : -1));
        state.myVotes = after ? [...state.myVotes, change.songId] : state.myVotes.filter((id) => id !== change.songId);
      }
    }
    if (change.action === "setClaim" && change.songId && change.role) {
      ownClaims = ownClaims.filter((claim) => claim.songId !== change.songId || claim.role !== change.role);
      if (change.selected) ownClaims.push({ songId: change.songId, role: change.role as Claim["role"], memberId: state.viewer.id });
    }
    if (change.action === "artist" && change.songId && change.artist) state.choices[change.songId] = { artist: change.artist, revision: base.choices[change.songId]?.revision || 0 };
  }
  state.members = state.members.filter((member) => member.id !== state.viewer.id);
  if (state.viewer.enabled) state.members.push(state.viewer);
  state.ownClaims = ownClaims;
  state.claims = [...base.claims.filter((claim) => claim.memberId !== state.viewer.id), ...(state.viewer.enabled ? ownClaims : [])];
  return state;
}

export class JamSync {
  private base?: JamState;
  private queue: PendingChange[] = [];
  private revision = 0;
  private clientId = crypto.randomUUID();
  private busy = false;
  private saving = false;
  private started = false;
  private syncRequested = false;
  private lastExitRevision = 0;
  private error = "";
  private localError = "";
  private updatedAt = "";
  private listeners = new Set<() => void>();
  private snapshot!: Snapshot;
  private key: string;

  constructor(private token: string, private storage: Storage, private request: Transport, private sendOnExit: (batch: Record<string, unknown>) => boolean) {
    this.key = "wedding-jam-local-v1:" + token;
    try {
      const saved = JSON.parse(storage.getItem(this.key) || "null");
      if (saved?.version === 1 && Array.isArray(saved.pending) && typeof saved.clientId === "string" && Number.isSafeInteger(saved.revision)) {
        // Recover queued choices even if an older response left the cached board incomplete.
        this.base = isJamState(saved.state) ? saved.state : undefined; this.queue = saved.pending; this.clientId = saved.clientId; this.revision = saved.revision; this.updatedAt = saved.updatedAt || "";
      }
    } catch { this.localError = "Browser storage is unavailable. Keep this tab open until your choices sync."; }
    this.publish();
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() {
    this.snapshot = { state: this.base ? optimisticState(this.base, this.queue) : undefined, pending: this.queue.length, syncing: this.saving, refreshing: this.busy && !this.saving, loading: !this.base && !this.started, error: this.error, localError: this.localError, updatedAt: this.updatedAt };
    this.listeners.forEach((listener) => listener());
  }
  private persist() {
    try {
      this.storage.setItem(this.key, JSON.stringify({ version: 1, state: this.base, pending: this.queue, clientId: this.clientId, revision: this.revision, updatedAt: this.updatedAt }));
      this.localError = "";
      return true;
    } catch { this.localError = "Browser storage is unavailable. Keep this tab open until your choices sync."; return false; }
  }
  start = async () => {
    if (!this.base) { await this.refresh(); if (this.base && this.queue.length) await this.sync(); return; }
    return this.queue.length ? this.sync() : this.refresh();
  };

  change = (change: MusicChange) => {
    if (!this.base) return;
    // Preserve musician on/off ordering around instrument claims. Other toggles keep only their latest intent.
    if (change.action !== "participation") this.queue = this.queue.filter((entry) => !(entry.action === change.action && entry.songId === change.songId && entry.role === change.role));
    this.queue.push({ ...change, revision: ++this.revision });
    this.error = "";
    const persisted = this.persist();
    this.publish();
    if (!persisted) void this.sync();
  };

  refresh = async () => {
    if (this.busy || !this.token) { if (!this.token) { this.started = true; this.publish(); } return; }
    this.busy = true; this.publish();
    try {
      const result = await this.request("state");
      if (result.ok && isJamState(result.state)) { this.base = result.state; this.error = ""; this.updatedAt = new Date().toISOString(); this.persist(); }
      else this.error = result.ok ? "The shared board returned an incomplete update. Keeping your current songs and saved choices." : result.error;
    } catch { this.error = "Shared board unavailable. Your saved choices will stay on this device."; }
    finally { this.started = true; this.busy = false; this.publish(); this.resumeRequestedSync(); }
  };

  private batch(): { payload: Batch; revisions: Set<number>; hasMore: boolean } | undefined {
    if (!this.queue.length) return;
    let entries = this.queue.slice(0, 700);
    let payload: Batch;
    do {
      payload = { clientId: this.clientId, revision: entries[entries.length - 1].revision, changes: entries.map(({ revision: _revision, ...change }) => change) };
      if (new TextEncoder().encode(JSON.stringify({ ...payload, token: this.token, action: "batch" })).length <= 55000) break;
      entries = entries.slice(0, -1);
    } while (entries.length);
    return entries.length ? { payload: payload!, revisions: new Set(entries.map((entry) => entry.revision)), hasMore: entries.length < this.queue.length } : undefined;
  }

  sync = async () => {
    if (this.busy) { this.syncRequested = true; return; }
    const batch = this.batch();
    if (!batch) return;
    this.lastExitRevision = 0;
    this.busy = true; this.saving = true; this.error = ""; this.publish();
    try {
      const result = await this.request("batch", batch.payload);
      if (result.ok && result.ackRevision === batch.payload.revision && isJamState(result.state)) {
        this.base = result.state;
        this.queue = this.queue.filter((entry) => !batch.revisions.has(entry.revision));
        this.updatedAt = new Date().toISOString(); this.persist();
        if (batch.hasMore && this.queue.length) this.syncRequested = true;
      } else this.error = result.ok ? "The server did not confirm this save. Your choices are still saved on this device." : result.error;
    } catch { this.error = "Couldn't sync yet. Your choices are saved on this device and will retry."; }
    finally { this.busy = false; this.saving = false; this.publish(); this.resumeRequestedSync(); }
  };
  private resumeRequestedSync() {
    if (this.syncRequested) { this.syncRequested = false; if (this.queue.length) void this.sync(); }
  }
  syncOrRefresh = () => this.queue.length ? this.sync() : this.refresh();
  flushOnExit = () => {
    this.persist();
    const batch = this.batch();
    if (batch && this.lastExitRevision !== batch.payload.revision && this.sendOnExit(batch.payload)) this.lastExitRevision = batch.payload.revision;
    // Delivery isn't an acknowledgement: keep the queue until the server confirms it on a later visit.
  };
}

export function installJamSync(sync: JamSync, browser: Pick<Window, "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener"> = window, page: Pick<Document, "hidden" | "activeElement" | "addEventListener" | "removeEventListener"> = document) {
  void sync.start();
  const refreshTimer = browser.setInterval(() => { if (!page.hidden && page.activeElement?.tagName !== "SELECT") void sync.refresh(); }, 60000);
  const saveTimer = browser.setInterval(() => { void sync.sync(); }, 5 * 60000);
  const onVisibility = () => { if (page.hidden) sync.flushOnExit(); else void sync.syncOrRefresh(); };
  const onOnline = () => { void sync.syncOrRefresh(); };
  page.addEventListener("visibilitychange", onVisibility);
  browser.addEventListener("pagehide", sync.flushOnExit);
  browser.addEventListener("beforeunload", sync.flushOnExit);
  browser.addEventListener("online", onOnline);
  return () => {
    browser.clearInterval(refreshTimer); browser.clearInterval(saveTimer);
    page.removeEventListener("visibilitychange", onVisibility);
    browser.removeEventListener("pagehide", sync.flushOnExit);
    browser.removeEventListener("beforeunload", sync.flushOnExit);
    browser.removeEventListener("online", onOnline);
    sync.flushOnExit();
  };
}
