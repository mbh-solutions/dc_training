import type { JwtHeader, JwtPayload, Session } from "@supabase/supabase-js";
import {
  supabase,
  supabaseAuthJwks,
  supabaseOwnerSubjectSha256,
  supabaseUrl,
} from "./supabase.js";

type PinnedJwk = JsonWebKey & {
  alg: "ES256";
  key_ops: string[];
  kid: string;
  kty: "EC";
};
type PinnedJwks = { keys: PinnedJwk[] };

let pinnedJwks: unknown = null;
try {
  pinnedJwks = JSON.parse(supabaseAuthJwks ?? "");
} catch {
  pinnedJwks = null;
}

function isPinnedJwk(value: unknown): value is PinnedJwk {
  if (!value || typeof value !== "object") return false;
  const key = value as Partial<PinnedJwk>;
  return (
    key.alg === "ES256" &&
    key.crv === "P-256" &&
    key.kty === "EC" &&
    typeof key.kid === "string" &&
    key.kid.length > 0 &&
    Array.isArray(key.key_ops) &&
    key.key_ops.includes("verify") &&
    key.use === "sig"
  );
}

function isPinnedJwks(value: unknown): value is PinnedJwks {
  if (!value || typeof value !== "object" || !("keys" in value)) return false;
  const { keys } = value as { keys: unknown };
  return Array.isArray(keys) && keys.length > 0 && keys.every(isPinnedJwk);
}

function hasAuthenticatedAudience(audience: JwtPayload["aud"]) {
  return (
    audience === "authenticated" ||
    (Array.isArray(audience) && audience.includes("authenticated"))
  );
}

async function sha256(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function claimsAuthorizeOwner(
  header: JwtHeader,
  claims: JwtPayload,
  session: Session,
  keys: PinnedJwk[],
  subjectSha256: string,
) {
  return (
    header.alg === "ES256" &&
    keys.some((key) => key.kid === header.kid) &&
    claims.iss === `${supabaseUrl!.replace(/\/$/, "")}/auth/v1` &&
    hasAuthenticatedAudience(claims.aud) &&
    typeof claims.exp === "number" &&
    claims.exp > Math.floor(Date.now() / 1000) &&
    claims.role === "authenticated" &&
    claims.is_anonymous === false &&
    claims.sub === session.user.id &&
    subjectSha256 === supabaseOwnerSubjectSha256
  );
}

export async function verifyOfflineOwnerSession(session: Session) {
  if (
    !supabase ||
    !supabaseUrl ||
    !supabaseOwnerSubjectSha256 ||
    !isPinnedJwks(pinnedJwks)
  ) {
    return false;
  }

  try {
    const { data, error } = await supabase.auth.getClaims(
      session.access_token,
      { jwks: pinnedJwks },
    );
    if (error || !data || typeof data.claims.sub !== "string") return false;

    return claimsAuthorizeOwner(
      data.header,
      data.claims,
      session,
      pinnedJwks.keys,
      await sha256(data.claims.sub),
    );
  } catch {
    return false;
  }
}
