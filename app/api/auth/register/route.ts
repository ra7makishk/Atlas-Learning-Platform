import bcrypt from "bcryptjs";
import { one } from "../../../../lib/db";
import { createSession, getOrCreateDeviceId } from "../../../../lib/auth";
import { apiError, clean } from "../../../../lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = clean(body.email, 160).toLowerCase();
    const password = clean(body.password, 200);
    const name = clean(body.name, 120);
    const phone = clean(body.phone, 30);
    const level = clean(body.level, 30);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !name || !phone || !["first_year","second_year","third_year","fourth_year","graduate"].includes(level)) {
      return Response.json({ error: "Valid email, name, phone, level, and an 8-character password are required" }, { status: 400 });
    }
    const exists = await one("SELECT id FROM users WHERE email=$1", [email]);
    if (exists) return Response.json({ error: "An account already exists for this email" }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12);
    const deviceId = await getOrCreateDeviceId();
    const user = await one<{ id: number; email: string; role: "student" }>(
      `INSERT INTO users (email,password_hash,name,phone,whatsapp,country,city,specialty,level,role,status,trusted_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'student','pending',$10) RETURNING id,email,role`,
      [email, passwordHash, name, phone, clean(body.whatsapp, 30), clean(body.country, 80), clean(body.city, 80), clean(body.specialty, 160), level, deviceId],
    );
    if (!user) throw new Error("Account could not be created");
    await createSession(user, deviceId);
    return Response.json({ ok: true, redirect: "/workspace" }, { status: 201 });
  } catch (error) { return apiError(error, "Register error"); }
}
