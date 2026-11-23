import { requireIdentity } from "../../cursor/identity";

export async function ownerFromRequest(request: Request): Promise<string | Response> {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return identity.sub;
}

export async function viewerFromRequest(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return {
    sub: identity.sub,
    name: identity.name || "学习者",
    email: identity.email,
    kind: identity.kind,
    simulated: "simulated" in identity ? Boolean(identity.simulated) : false,
  };
}
