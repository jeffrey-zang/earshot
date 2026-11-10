// Temporary: audio diagnostics from test devices, printed to the server log.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; ua?: string; events?: unknown[] };
    for (const e of body.events ?? []) console.log(`[client ${body.id ?? "?"}]`, JSON.stringify(e));
  } catch {
    /* ignore */
  }
  return new Response(null, { status: 204 });
}
