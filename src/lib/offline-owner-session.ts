import type { Session } from "@supabase/supabase-js";
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

let pinnedJwks: PinnedJwks | null = null;
try {
  pinnedJwks = JSON.parse(supabaseAuthJwks ?? "") as PinnedJwks;
} catch {
  pinnedJwks = null;
}

export async function verifyOfflineOwnerSession(session: Session) {
  const keys = pinnedJwks?.keys;
  if (
    !supabase ||
    !supabaseUrl ||
    !supabaseOwnerSubjectSha256 ||
    !keys?.length ||
    keys.some(
      (key) =>
        key.alg !== "ES256" ||
        key.crv !== "P-256" ||
        key.kty !== "EC" ||
        !key.kid ||
        !key.key_ops.includes("verify") ||
        key.use !== "sig",
    )
  ) {
    return false;
  }

  try {
    const { data, error } = await supabase.auth.getClaims(
      session.access_token,
      { jwks: pinnedJwks! },
    );
    if (error || !data || typeof data.claims.sub !== "string") return false;

    const audience = data.claims.aud;
    const authenticatedAudience =
      audience === "authenticated" ||
      (Array.isArray(audience) && audience.includes("authenticated"));
    const subjectBytes = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(data.claims.sub),
      ),
    );
    let subjectSha256 = "";
    for (const byte of subjectBytes) {
      subjectSha256 += byte.toString(16).padStart(2, "0");
    }

    return (
      data.header.alg === "ES256" &&
      keys.some((key) => key.kid === data.header.kid) &&
      data.claims.iss === `${supabaseUrl.replace(/\/$/, "")}/auth/v1` &&
      authenticatedAudience &&
      typeof data.claims.exp === "number" &&
      data.claims.exp > Math.floor(Date.now() / 1000) &&
      data.claims.role === "authenticated" &&
      data.claims.is_anonymous === false &&
      data.claims.sub === session.user.id &&
      subjectSha256 === supabaseOwnerSubjectSha256
    );
  } catch {
    return false;
  }
}
