import bcrypt from "bcryptjs";
import { one, pool } from "../../../../lib/db";
import { createSession, getOrCreateDeviceId } from "../../../../lib/auth";
import { apiError, clean } from "../../../../lib/validation";
import type { PlatformRole } from "../../../../lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = clean(body.email, 160).toLowerCase();
    const password = clean(body.password, 200);
    const remember = body.rememberMe === "on" || body.rememberMe === true || body.rememberMe === "true";
    const user = await one<{ id: number; email: string; password_hash: string; role: PlatformRole; status: string; trusted_device_id: string | null }>(
      "SELECT id,email,password_hash,role,status,trusted_device_id FROM users WHERE email=$1", [email],
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return Response.json({ error: "Incorrect email or password" }, { status: 401 });
    if (["rejected", "blocked"].includes(user.status)) return Response.json({ error: "This account is not currently allowed to sign in" }, { status: 403 });
    const deviceId = await getOrCreateDeviceId();
    if (user.role === "student" && user.trusted_device_id && user.trusted_device_id !== deviceId) {
      await pool.query(
        `INSERT INTO device_requests (user_email,current_device_id,requested_device_id,status)
         SELECT $1,$2,$3,'pending' WHERE NOT EXISTS
         (SELECT 1 FROM device_requests WHERE user_email=$1 AND requested_device_id=$3 AND status='pending')`,
        [user.email, user.trusted_device_id, deviceId],
      );
      return Response.json({ error: "Another device is already trusted. An administrator must approve this device before it can sign in.", code: "DEVICE_CHANGE_REQUIRED" }, { status: 423 });
    }
    if (user.role === "student" && !user.trusted_device_id) await pool.query("UPDATE users SET trusted_device_id=$1 WHERE id=$2", [deviceId, user.id]);
    await createSession(user, deviceId, remember);
    return Response.json({ ok: true, redirect: "/workspace" });
  } catch (error) { return apiError(error, "Login error"); }
}