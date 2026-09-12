import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { one } from "./db";
import type { PlatformRole, PlatformUser } from "./types";

const SESSION_COOKIE = "atlas_session";
const DEVICE_COOKIE = "atlas_device";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(value);
}

type SessionPayload = { sub: string; email: string; role: PlatformRole; deviceId: string };

export async function createSession(user: { id: number; email: string; role: PlatformRole }, deviceId: string, remember = true) {
  const days = remember ? Math.max(1, Number(process.env.SESSION_DAYS || 7)) : 1;
  const token = await new SignJWT({ email: user.email, role: user.role, deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const sessionCookie = remember
    ? { httpOnly: true as const, sameSite: "lax" as const, secure, path: "/", maxAge: days * 86400 }
    : { httpOnly: true as const, sameSite: "lax" as const, secure, path: "/" };
  jar.set(SESSION_COOKIE, token, sessionCookie);
  jar.set(DEVICE_COOKIE, deviceId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 365 * 86400 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getOrCreateDeviceId() {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing) return existing;
  const generated = crypto.randomUUID();
  jar.set(DEVICE_COOKIE, generated, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
  return generated;
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret());
    const payload = verified.payload as unknown as SessionPayload;
    if (!payload.sub || !payload.email || !payload.deviceId) return null;
    return payload;
  } catch { return null; }
}

export async function currentUser(): Promise<PlatformUser | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await one<{
    id: number; email: string; name: string; role: PlatformRole; status: string; phone: string; whatsapp: string;
    country: string; city: string; specialty: string; stage: string; level: string; college_id: number | null; university_id: number | null; year_id: number | null; trusted_device_id: string | null; onboarding_choice: string;
  }>("SELECT id,email,name,role,status,phone,whatsapp,country,city,specialty,stage,level,college_id,university_id,year_id,trusted_device_id,onboarding_choice FROM users WHERE id=$1 AND email=$2", [Number(session.sub), session.email]);
  if (!user) return null;
  if (user.role === "student" && user.trusted_device_id && user.trusted_device_id !== session.deviceId) return null;
  return { ...user, collegeId: user.college_id, universityId: user.university_id, yearId: user.year_id, trustedDeviceId: user.trusted_device_id, onboardingChoice: user.onboarding_choice };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) return { error: "Sign in required", status: 401 as const };
  return { user };
}

export async function requireManager() {
  const access = await requireUser();
  if ("error" in access) return access;
  if (!(["admin", "instructor"] as string[]).includes(access.user.role)) return { error: "Manager access required", status: 403 as const };
  return access;
}