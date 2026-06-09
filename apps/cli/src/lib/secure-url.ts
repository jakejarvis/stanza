/**
 * Env opt-out for cleartext *remote* registry/npm endpoints. Any non-empty
 * value enables it (same convention as `STANZA_NO_NPM_LOOKUP`); docs show `=1`.
 */
const ALLOW_INSECURE_ENV = "STANZA_ALLOW_INSECURE_REGISTRY";

/** Cleartext (non-TLS) `http://` — the only scheme we scrutinize for fetches. */
function isCleartextHttp(uri: string): boolean {
  return /^http:\/\//i.test(uri);
}

// 127.0.0.0/8 written as a literal IPv4 (not a `127.` prefix) so a hostile host
// like `127.evil.com` can't masquerade as loopback.
const IPV4_LOOPBACK = /^127(\.\d{1,3}){3}$/;

/**
 * True for an `http://` URL whose literal host is loopback. Loopback traffic
 * never leaves the machine, so there is no network path for an on-path attacker
 * — it's no more exposed than a local file. Matching the literal hostname (not
 * a resolved IP) keeps DNS rebinding from sneaking a remote host past the gate.
 */
function isLoopbackHttp(uri: string): boolean {
  let host: string;
  try {
    host = new URL(uri).hostname.toLowerCase();
  } catch {
    return false;
  }
  host = host.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  return host === "localhost" || host === "::1" || IPV4_LOOPBACK.test(host);
}

// Warn at most once per distinct endpoint so an opted-in user isn't spammed.
const warnedInsecure = new Set<string>();

/**
 * Guard a remote fetch URL before it is contacted. Registry and npm payloads
 * get no integrity check beyond TLS, so a cleartext `http://` endpoint lets an
 * on-path attacker swap module content or steer dependency versions — RCE on
 * the next install/build. Reject remote `http://` unless the user knowingly
 * opts into an internal mirror via `STANZA_ALLOW_INSECURE_REGISTRY` (warned
 * once). `https://`, `file://`, bare filesystem paths, and loopback `http://`
 * always pass, so local-dev and air-gapped workflows are unaffected.
 */
export function assertSecureFetchUrl(uri: string, label: string): void {
  if (!isCleartextHttp(uri) || isLoopbackHttp(uri)) return;
  if (process.env[ALLOW_INSECURE_ENV]) {
    if (!warnedInsecure.has(uri)) {
      warnedInsecure.add(uri);
      console.warn(
        `⚠ ${label} uses cleartext http:// ("${uri}"). Its payload is not integrity-checked ` +
          `beyond TLS, so an on-path attacker could tamper with it. Allowed because ` +
          `${ALLOW_INSECURE_ENV} is set.`,
      );
    }
    return;
  }
  throw new Error(
    `${label} must use https:// (got "${uri}"). Registry and npm payloads are not ` +
      `integrity-checked beyond TLS, so cleartext http:// is refused. Use https://, a local ` +
      `file:// path, or set ${ALLOW_INSECURE_ENV}=1 if you knowingly need an internal http mirror.`,
  );
}

/** Test-only: drop the once-per-endpoint warning state between cases. */
export function clearInsecureWarningsForTests(): void {
  warnedInsecure.clear();
}
