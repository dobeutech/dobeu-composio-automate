// dobeu-webhook-archive — Cloudflare Worker
// Implements: Stage 0B.4 ingress + Appendix I HMAC + Appendix K Stripe saga handoff
// Source-of-truth: v5-final-consolidated-plan.md (sections 0B.2/0B.4, Appendix I/J/K)
//                  v4-architecture-diagrams.md diagram 3 (sequence flow)
//
// Flow: Src -> [HMAC verify] -> [exclusion preflight] -> [R2 put] -> [ledger idempotency]
//             -> [forward raw body + x-archive-key to Make] -> 200
// Fail-open: on R2 write error, log + forward to Make anyway (do not block ingress).
// Fail-closed: HMAC invalid or exclusion hit -> 401/403, no forwarding, no R2.

export interface Env {
  // R2
  WEBHOOK_ARCHIVE: R2Bucket
  // Optional second-layer idempotency cache (KV)
  IDEMPOTENCY_KV?: KVNamespace
  // Service binding -> r2-signer worker (signed-URL egress)
  R2_SIGNER: Fetcher
  // Per-source HMAC secrets (Doppler -> wrangler secret put)
  STRIPE_WEBHOOK_SECRET: string
  TYPEFORM_WEBHOOK_SECRET: string
  INTERCOM_WEBHOOK_SECRET: string
  APOLLO_WEBHOOK_SECRET: string
  POSTHOG_WEBHOOK_SECRET: string
  LINEAR_WEBHOOK_SIGNING_SECRET: string
  WEBFLOW_WEBHOOK_SECRET: string
  RUBE_MONITOR_SECRET: string
  // Supabase event_ledger (PostgREST direct HTTP)
  SUPABASE_URL: string
  SUPABASE_EVENT_LEDGER_KEY: string
  // Make hook URLs (per-source JSON mapping)
  MAKE_HOOK_URLS_JSON: string // {"stripe":"https://hook.us1.make.com/...","typeform":"..."}
  // Exclusion zone (Appendix M) — DTS-1653 permanent guardrail
  EXCLUSION_ZONE_JSON: string // {"github":["dobeutech/agent-usl-website","dobeutech/usl-agent-website"],"netlify":["e8cf44e2-089c-4f4c-8b10-1998df378cf7"]}
  // Cloudflare Access JWT verification
  CF_ACCESS_AUD: string
  CF_ACCESS_TEAM: string // e.g. dobeu.cloudflareaccess.com
  // Observability
  SENTRY_DSN?: string
  DATADOG_API_KEY?: string
}

type Source = 'stripe' | 'typeform' | 'intercom' | 'apollo' | 'posthog' | 'linear' | 'webflow' | 'rube'
const VALID_SOURCES: Source[] = ['stripe','typeform','intercom','apollo','posthog','linear','webflow','rube']

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (req.method === 'GET' && url.pathname === '/health') return health()
      if (req.method === 'GET' && url.pathname.startsWith('/signed/')) {
        return signedEgress(req, env, url.pathname.slice('/signed/'.length))
      }
      if (req.method === 'POST' && url.pathname.startsWith('/ingress/')) {
        const source = url.pathname.slice('/ingress/'.length) as Source
        if (!VALID_SOURCES.includes(source)) return json({ error: 'unknown_source' }, 404)
        return ingest(req, env, ctx, source)
      }
      return json({ error: 'not_found' }, 404)
    } catch (err) {
      log('error', { msg: 'unhandled', err: String(err), path: url.pathname })
      return json({ error: 'internal' }, 500)
    }
  },
} satisfies ExportedHandler<Env>

// ------------------------- ingress -------------------------
async function ingest(req: Request, env: Env, ctx: ExecutionContext, source: Source): Promise<Response> {
  // CRITICAL: preserve raw body bytes for HMAC (esp. Stripe) before any parse.
  const rawBody = await req.arrayBuffer()
  const rawText = new TextDecoder().decode(rawBody)
  const canary = req.headers.get('x-dobeu-canary') === 'true'

  // 1) HMAC verify (fail-closed per Appendix I)
  const hmacOk = await verifyHmac(source, req.headers, rawBody, rawText, env)
  if (!hmacOk) {
    log('warn', { msg: 'hmac_fail', source })
    // TODO: emit Datadog metric webhook.hmac_failure + Linear DTS-SEC-ALERT if >3/min
    return json({ error: 'invalid_signature' }, 401)
  }

  // 2) Exclusion zone preflight (Appendix M / DTS-1653)
  const exMatch = exclusionHit(rawText, env.EXCLUSION_ZONE_JSON)
  if (exMatch) {
    log('error', { msg: 'exclusion_zone_hit', source, matched: exMatch })
    // TODO: Sentry breadcrumb + Datadog exclusion_zone.violation_attempted
    return json({ error: 'exclusion_zone', matched: exMatch }, 403)
  }

  // 3) Compute archive key
  const hash = await sha256Hex(rawBody)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const prefix = canary ? 'canary/' : ''
  const key = `${prefix}${source}/${ts}-${hash.slice(0, 16)}.json`

  // 4) Idempotency check (ledger via PostgREST). Non-blocking — best-effort log.
  const eventId = extractEventId(source, rawText, req.headers)
  if (eventId && !canary) {
    const already = await ledgerSeen(env, source, eventId)
    if (already) {
      log('info', { msg: 'idempotent_replay_skipped', source, eventId, key })
      return json({ ok: true, idempotent: true, key }, 200)
    }
  }

  // 5) R2 put — fail-open per 0B.4 (diagram 3 step 4)
  let r2Ok = false
  try {
    await env.WEBHOOK_ARCHIVE.put(key, rawBody, {
      httpMetadata: { contentType: req.headers.get('content-type') || 'application/json' },
      customMetadata: {
        source, hash, received_at: new Date().toISOString(),
        canary: String(canary), event_id: eventId || '',
      },
    })
    r2Ok = true
  } catch (err) {
    log('error', { msg: 'r2_put_failed_fail_open', source, key, err: String(err) })
  }

  // 6) Ledger insert (best-effort; Make consumer will upsert on receive anyway)
  if (eventId && !canary) {
    ctx.waitUntil(ledgerInsert(env, {
      source, eventId, hash, r2Key: key,
    }).catch((e) => log('error', { msg: 'ledger_insert_failed', err: String(e) })))
  }

  // 7) Canary path stops here (0C.3) — do not forward to Make
  if (canary) {
    log('info', { msg: 'canary_archived', source, key })
    return json({ ok: true, canary: true, key, r2Ok }, 200)
  }

  // 8) Forward raw body + x-archive-key to Make
  const makeUrl = lookupMakeUrl(env.MAKE_HOOK_URLS_JSON, source)
  if (!makeUrl) {
    log('error', { msg: 'no_make_url_mapped', source })
    return json({ error: 'no_downstream' }, 502)
  }
  const fwd = await forwardToMake(makeUrl, rawBody, req.headers, key)
  log('info', { msg: 'forwarded', source, key, r2Ok, status: fwd.status, eventId })
  return json({ ok: true, key, r2Ok, downstream: fwd.status }, 200)
}

// ------------------------- HMAC -------------------------
async function verifyHmac(source: Source, h: Headers, raw: ArrayBuffer, rawText: string, env: Env): Promise<boolean> {
  switch (source) {
    case 'stripe':   return verifyStripe(h.get('stripe-signature'), rawText, env.STRIPE_WEBHOOK_SECRET)
    case 'typeform': return verifyB64Sha256(h.get('typeform-signature'), raw, env.TYPEFORM_WEBHOOK_SECRET)
    case 'intercom': return verifyHubSig(h, raw, env.INTERCOM_WEBHOOK_SECRET)
    case 'apollo':   return verifyHexSha256(h.get('x-apollo-signature'), raw, env.APOLLO_WEBHOOK_SECRET)
    case 'posthog':  return verifyHexSha256(h.get('x-posthog-signature'), raw, env.POSTHOG_WEBHOOK_SECRET)
    case 'linear':   return verifyHubSig(h, raw, env.LINEAR_WEBHOOK_SIGNING_SECRET, 'linear-signature')
    case 'webflow':  return verifyWebflow(h, rawText, env.WEBFLOW_WEBHOOK_SECRET)
    case 'rube':     return verifyHexSha256(h.get('x-rube-signature'), raw, env.RUBE_MONITOR_SECRET)
  }
}

// Stripe: `t=<ts>,v1=<sig>`; sign `${t}.${rawBody}`; 5-min tolerance; reject replay
async function verifyStripe(header: string | null, rawText: string, secret: string): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]))
  const t = parts.t, v1 = parts.v1
  if (!t || !v1) return false
  const age = Math.abs(Date.now() / 1000 - Number(t))
  if (!Number.isFinite(age) || age > 300) return false
  const expected = await hmacHex(secret, `${t}.${rawText}`)
  return timingSafeEqualHex(v1, expected)
}

// Typeform: base64 of HMAC-SHA256; header "sha256=<b64>"
async function verifyB64Sha256(header: string | null, raw: ArrayBuffer, secret: string): Promise<boolean> {
  if (!header) return false
  const sent = header.replace(/^sha256=/, '')
  const mac = await hmacRaw(secret, new Uint8Array(raw))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return timingSafeEqualStr(sent, expected)
}

// X-Hub-Signature-256 preferred; X-Hub-Signature (SHA1) fallback. Format "<algo>=<hex>"
async function verifyHubSig(h: Headers, raw: ArrayBuffer, secret: string, altHeader?: string): Promise<boolean> {
  const hdr = h.get('x-hub-signature-256') || h.get(altHeader || 'x-hub-signature-256') || h.get('x-hub-signature')
  if (!hdr) return false
  const algo = hdr.startsWith('sha256=') ? 'SHA-256' : 'SHA-1'
  const sent = hdr.replace(/^sha(256|1)=/, '')
  const expected = await hmacHex(secret, new Uint8Array(raw), algo)
  return timingSafeEqualHex(sent, expected)
}

async function verifyHexSha256(header: string | null, raw: ArrayBuffer, secret: string): Promise<boolean> {
  if (!header) return false
  const sent = header.replace(/^sha256=/, '')
  const expected = await hmacHex(secret, new Uint8Array(raw))
  return timingSafeEqualHex(sent, expected)
}

// Webflow: `X-Webflow-Signature` + `X-Webflow-Timestamp`; sign `${ts}:${rawBody}`; 300s tolerance
async function verifyWebflow(h: Headers, rawText: string, secret: string): Promise<boolean> {
  const sig = h.get('x-webflow-signature'), ts = h.get('x-webflow-timestamp')
  if (!sig || !ts) return false
  if (Math.abs(Date.now() - Number(ts)) > 300_000) return false
  const expected = await hmacHex(secret, `${ts}:${rawText}`)
  return timingSafeEqualHex(sig, expected)
}

// ------------------------- crypto helpers -------------------------
async function hmacRaw(secret: string, data: BufferSource, algo = 'SHA-256'): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algo }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, data)
}
async function hmacHex(secret: string, data: string | BufferSource, algo = 'SHA-256'): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return toHex(await hmacRaw(secret, buf, algo))
}
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', buf))
}
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
// timing-safe compare (length-independent short-circuit avoided)
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function timingSafeEqualHex(a: string, b: string): boolean {
  return timingSafeEqualStr(a.toLowerCase(), b.toLowerCase())
}

// ------------------------- ledger (Supabase PostgREST) -------------------------
async function ledgerSeen(env: Env, source: string, eventId: string): Promise<boolean> {
  const u = `${env.SUPABASE_URL}/rest/v1/event_ledger?source_system=eq.${encodeURIComponent(source)}&source_object_id=eq.${encodeURIComponent(eventId)}&select=event_key&limit=1`
  try {
    const r = await fetch(u, { headers: sbHeaders(env) })
    if (!r.ok) return false
    const rows = await r.json() as unknown[]
    return Array.isArray(rows) && rows.length > 0
  } catch { return false }
}
async function ledgerInsert(env: Env, row: { source: string; eventId: string; hash: string; r2Key: string }): Promise<void> {
  const body = {
    event_key: `${row.source}:${row.eventId}`,
    source_system: row.source,
    event_type: 'ingress',
    source_object_id: row.eventId,
    payload_hash: row.hash,
    payload_pointer_r2: row.r2Key,
    status: 'received',
    last_seen_at: new Date().toISOString(),
  }
  await fetch(`${env.SUPABASE_URL}/rest/v1/event_ledger`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(body),
  })
}
function sbHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_EVENT_LEDGER_KEY,
    Authorization: `Bearer ${env.SUPABASE_EVENT_LEDGER_KEY}`,
    'Content-Type': 'application/json',
  }
}

// ------------------------- downstream forward -------------------------
function lookupMakeUrl(mappingJson: string, source: Source): string | null {
  try {
    const map = JSON.parse(mappingJson) as Record<string, string>
    return map[source] || null
  } catch { return null }
}
async function forwardToMake(url: string, raw: ArrayBuffer, inbound: Headers, key: string): Promise<Response> {
  const headers = new Headers()
  headers.set('content-type', inbound.get('content-type') || 'application/json')
  headers.set('x-archive-key', key)
  // Pass through original signature headers so Make can re-verify if configured
  for (const h of ['stripe-signature','typeform-signature','x-hub-signature','x-hub-signature-256',
    'x-apollo-signature','x-posthog-signature','linear-signature','x-webflow-signature','x-webflow-timestamp','x-rube-signature']) {
    const v = inbound.get(h); if (v) headers.set(h, v)
  }
  return fetch(url, { method: 'POST', headers, body: raw })
}

// ------------------------- exclusion zone -------------------------
function exclusionHit(rawText: string, zoneJson: string): string | null {
  try {
    const zone = JSON.parse(zoneJson) as Record<string, string[]>
    const needles = Object.values(zone).flat()
    for (const n of needles) if (n && rawText.includes(n)) return n
    return null
  } catch { return null }
}

// ------------------------- event-id extraction -------------------------
function extractEventId(source: Source, rawText: string, h: Headers): string | null {
  try {
    const body = JSON.parse(rawText) as Record<string, unknown>
    switch (source) {
      case 'stripe':   return (body.id as string) || null
      case 'typeform': return ((body.event_id as string) || (body.token as string)) || null
      case 'intercom': return (body.id as string) || null
      case 'apollo':   return (body.event_id as string) || null
      case 'posthog':  return (body.uuid as string) || null
      case 'linear':   return ((body.data as Record<string, unknown>)?.id as string) || (body.id as string) || null
      case 'webflow':  return (body._id as string) || (body.triggerType as string) || null
      case 'rube':     return (body.event_id as string) || h.get('x-request-id')
    }
  } catch { return h.get('x-request-id') }
}

// ------------------------- signed egress (Access JWT) -------------------------
async function signedEgress(req: Request, env: Env, key: string): Promise<Response> {
  const jwt = req.headers.get('cf-access-jwt-assertion')
  if (!jwt) return json({ error: 'access_jwt_missing' }, 401)
  const jwtOk = await verifyAccessJwt(jwt, env)
  if (!jwtOk) return json({ error: 'access_jwt_invalid' }, 401)
  // Delegate signed-URL issuance to the r2-signer service binding (15-min TTL)
  const signerResp = await env.R2_SIGNER.fetch(new Request(
    `https://r2-signer.internal/sign?key=${encodeURIComponent(key)}&ttl=900`,
    { method: 'GET', headers: { 'x-requested-by': 'webhook-archive' } },
  ))
  return signerResp
}

async function verifyAccessJwt(jwt: string, env: Env): Promise<boolean> {
  // Minimal verification: fetch JWKS from team domain, verify kid+sig+aud+exp.
  // Kept short; production path should cache JWKS in KV with TTL.
  try {
    const [h64, p64, s64] = jwt.split('.')
    if (!h64 || !p64 || !s64) return false
    const header = JSON.parse(atob(h64.replace(/-/g, '+').replace(/_/g, '/'))) as { kid: string; alg: string }
    const payload = JSON.parse(atob(p64.replace(/-/g, '+').replace(/_/g, '/'))) as { aud: string | string[]; exp: number }
    if (payload.exp * 1000 < Date.now()) return false
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(env.CF_ACCESS_AUD)) return false
    const jwksResp = await fetch(`https://${env.CF_ACCESS_TEAM}/cdn-cgi/access/certs`)
    const jwks = await jwksResp.json() as { keys: JsonWebKey[] & { kid: string }[] }
    const jwk = jwks.keys.find((k: JsonWebKey & { kid?: string }) => k.kid === header.kid)
    if (!jwk) return false
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const signed = new TextEncoder().encode(`${h64}.${p64}`)
    const sig = Uint8Array.from(atob(s64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed)
  } catch { return false }
}

// ------------------------- utilities -------------------------
function health(): Response {
  return json({ ok: true, service: 'dobeu-webhook-archive', ts: new Date().toISOString() }, 200)
}
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
function log(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  // Structured JSON -> Cloudflare Logs/Logpush
  const line = { level, ts: new Date().toISOString(), service: 'dobeu-webhook-archive', ...fields }
  // eslint-disable-next-line no-console
  ;(level === 'error' ? console.error : level === 'warn' ? console.warn : console.log(JSON.stringify(line))