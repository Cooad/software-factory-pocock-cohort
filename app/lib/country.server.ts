import { getSession } from "~/lib/session";

// Null prices at full price (Tier 1, docs/adr/0012): a page never waits on a
// network call to learn the country.

export async function resolveCountry(request: Request): Promise<string | null> {
  const session = await getSession(request);
  const devCountry = session.get("devCountry");
  if (typeof devCountry === "string" && devCountry.length === 2) {
    return devCountry.toUpperCase();
  }

  const cfCountry = request.headers.get("CF-IPCountry");
  if (cfCountry && cfCountry.length === 2 && cfCountry !== "XX") {
    return cfCountry.toUpperCase();
  }

  return null;
}
