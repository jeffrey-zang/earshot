/** Temporary: send audio diagnostics to the test server (/api/log), batched. */
const id = Math.random().toString(36).slice(2, 7);
let queue: unknown[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!queue.length || typeof navigator === "undefined") return;
  const body = JSON.stringify({ id, ua: navigator.userAgent, events: queue });
  queue = [];
  try {
    if (!navigator.sendBeacon?.("/api/log", new Blob([body], { type: "application/json" }))) fetch("/api/log", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function dlog(event: string, data: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  queue.push({ t: Math.round(performance.now()), event, ...data });
  if (!timer) timer = setTimeout(flush, 800);
}

if (typeof window !== "undefined") {
  dlog("page", { ua: navigator.userAgent.slice(0, 120) });
  document.addEventListener("visibilitychange", () => {
    dlog("visibility", { hidden: document.hidden });
    if (document.hidden) flush();
  });
}
