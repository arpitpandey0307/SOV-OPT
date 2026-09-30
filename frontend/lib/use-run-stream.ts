"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type SolverEvent } from "./api";

export type StreamState = "connecting" | "live" | "reconnecting" | "ended" | "error";

/**
 * Subscribes to a run's Server-Sent Events stream. The first connection replays
 * the full event history; after a dropped connection the browser resends
 * Last-Event-ID and the server resumes from there, so no events are lost.
 */
export function useRunStream(runId: string) {
  const [events, setEvents] = useState<SolverEvent[]>([]);
  const [state, setState] = useState<StreamState>("connecting");
  const lastSeq = useRef(0);
  const qc = useQueryClient();

  // The caller keys the component by run id, so state starts fresh for every run.
  useEffect(() => {
    const es = new EventSource(api.eventsUrl(runId));
    let buffer: SolverEvent[] = [];
    let raf = 0;

    const flush = () => {
      raf = 0;
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      setEvents((prev) => prev.concat(batch));
    };

    es.onopen = () => setState("live");
    es.addEventListener("solver_event", (e) => {
      const seq = Number((e as MessageEvent).lastEventId);
      if (seq <= lastSeq.current) return;
      lastSeq.current = seq;
      const body = JSON.parse((e as MessageEvent).data);
      buffer.push({ seq, t: body.t, type: body.type, data: body.data });
      if (["RUN_COMPLETED", "RUN_CANCELLED", "RUN_FAILED", "INCUMBENT_FOUND", "SOLVE_COMPLETED"].includes(body.type)) {
        qc.invalidateQueries({ queryKey: ["run", runId] });
      }
      if (!raf) raf = requestAnimationFrame(flush);
    });
    es.addEventListener("end", () => {
      es.close();
      flush();
      setState("ended");
      qc.invalidateQueries({ queryKey: ["run", runId] });
      qc.invalidateQueries({ queryKey: ["runs"] });
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setState("error");
      else setState("reconnecting");
    };

    return () => {
      es.close();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [runId, qc]);

  return { events, state };
}
