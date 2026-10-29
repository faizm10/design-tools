"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRealtimeClient, type RealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { RealtimeProvider, useLiveQuery } from "@neon/realtime-react";
import { sceneHash, useCloud } from "@/lib/cloud";
import { createPlanSync, createPresenceSender, presenceBridge, PRESENCE_TIMEOUT_MS, SESSION_ID, setUserIdGetter, syncBridge, useCollab } from "@/lib/collab/session";
import type { LivePlanRow, LiveQueryGrant, LiveQueryName, PresenceRow } from "@/lib/collab/types";

/** Ask the server to seal a live query on the plan (also used to renew it). */
async function grant<Row>(planId: string, query: LiveQueryName): Promise<LiveQueryGrant<Row>> {
  const res = await fetch(`/api/plans/${planId}/live`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  if (!res.ok) throw Object.assign(new Error(`Live query unavailable (${res.status})`), { status: res.status });
  return res.json();
}

// One client per Realtime URL for the life of the page, as the SDK recommends:
// every subscription shares its WebSocket. A client whose connection failed for
// good can't reconnect, so it's dropped and the next session makes a new one.
const clients = new Map<string, RealtimeClient>();
function clientFor(url: string) {
  let c = clients.get(url);
  if (!c) {
    c = createRealtimeClient({ url, logLevel: process.env.NODE_ENV === "development" ? "warn" : "error" });
    clients.set(url, c);
  }
  return c;
}
function dropClient(url: string) {
  clients.get(url)?.close();
  clients.delete(url);
}

/** Mounts a live session for the open cloud plan, if there is one and the server has Realtime set up. */
export function CollabRoot() {
  const user = useCloud((s) => s.user);
  const planId = useCloud((s) => s.planId);
  useEffect(() => {
    setUserIdGetter(() => useCloud.getState().user?.id ?? null);
  }, []);
  useEffect(() => {
    if (!user || !planId) useCollab.setState({ planId: null, status: "off", shared: false, owned: true, peers: [], error: null });
  }, [user, planId]);
  if (!user || !planId) return null;
  // A different user or plan is a different session: remount from scratch.
  return <CollabSession key={`${user.id}:${planId}`} planId={planId} />;
}

function CollabSession({ planId }: { planId: string }) {
  const [grants, setGrants] = useState<{ url: string; plan: SealedLiveQuery<LivePlanRow>; presence: SealedLiveQuery<PresenceRow> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    useCollab.setState({ planId, status: "connecting", error: null, peers: [] });
    Promise.all([grant<LivePlanRow>(planId, "plan"), grant<PresenceRow>(planId, "presence")]).then(
      ([plan, presence]) => !cancelled && setGrants({ url: plan.url, plan: plan.sealed, presence: presence.sealed }),
      (e: { status?: number }) => {
        if (cancelled) return;
        // 503: Realtime isn't configured, so the plan just saves manually as before.
        useCollab.setState(e.status === 503 ? { status: "off" } : { status: "error", error: "Couldn’t connect to live updates." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (!grants) return null;
  return (
    <RealtimeProvider client={clientFor(grants.url)}>
      <PlanLive planId={planId} sealed={grants.plan} onFatal={() => dropClient(grants.url)} />
      <PresenceLive planId={planId} sealed={grants.presence} />
    </RealtimeProvider>
  );
}

function PlanLive({ planId, sealed, onFatal }: { planId: string; sealed: SealedLiveQuery<LivePlanRow>; onFatal: () => void }) {
  const refreshQuery = useCallback(() => grant<LivePlanRow>(planId, "plan").then((g) => g.sealed), [planId]);
  const { data, status, error } = useLiveQuery(sealed, { refreshQuery });
  const sync = useRef<ReturnType<typeof createPlanSync> | null>(null);

  // Declared before the data effect, so on mount the sync exists by the time the first rows are handed over.
  useEffect(() => {
    const s = createPlanSync(planId, {
      onSaved: (scene) => useCloud.getState().markSynced(scene),
      isPristine: (scene) => sceneHash(scene) === useCloud.getState().savedHash,
    });
    sync.current = s;
    syncBridge.flush = s.flush;
    return () => {
      s.stop();
      sync.current = null;
      if (syncBridge.flush === s.flush) syncBridge.flush = null;
    };
  }, [planId]);

  useEffect(() => {
    if (data) sync.current?.onRow(data[0]);
  }, [data]);

  useEffect(() => {
    if (status === "error" && error && !error.retryable) onFatal();
  }, [status, error, onFatal]);

  useEffect(() => {
    if (status === "error") useCollab.setState({ status: "error", error: error?.message ?? "Live updates stopped." });
    else if (status === "live") useCollab.setState((s) => (s.status === "error" ? s : { status: "live" }));
    else if (status === "stale" || status === "connecting") useCollab.setState((s) => (s.status === "error" ? s : { status: "connecting" }));
  }, [status, error]);

  return null;
}

function PresenceLive({ planId, sealed }: { planId: string; sealed: SealedLiveQuery<PresenceRow> }) {
  const refreshQuery = useCallback(() => grant<PresenceRow>(planId, "presence").then((g) => g.sealed), [planId]);
  const { data } = useLiveQuery(sealed, { refreshQuery });
  // Re-check freshness now and then, since a tab that vanished sends no update to say so.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const peers = (data ?? [])
      .filter((r) => r.session_id !== SESSION_ID && now - new Date(r.updated_at).getTime() < PRESENCE_TIMEOUT_MS)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    useCollab.setState({ peers });
  }, [data, now]);

  useEffect(() => {
    const sender = createPresenceSender(planId);
    presenceBridge.setCursor = sender.setCursor;
    return () => {
      sender.stop();
      if (presenceBridge.setCursor === sender.setCursor) presenceBridge.setCursor = null;
    };
  }, [planId]);

  return null;
}
