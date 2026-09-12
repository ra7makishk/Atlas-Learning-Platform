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
    const collegeId = Number(body.collegeId), universityId = Number(body.universityId), yearId = Number(body.yearId);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !name || !phone || !Number.isInteger(collegeId) || !Number.isInteger(universityId) || !Number.isInteger(yearId)) {
      return Response.json({ error: "Valid email, name, phone, an 8-character password, and your college/university/year are required" }, { status: 400 });
    }
    // Every step has to actually belong to the one before it, or a mismatched
    // set of ids (sent directly to the API rather than picked in order in the UI)
    // would silently record the wrong academic placement.
    const university = await one<{ id: number; college_id: string }>("SELECT id,college_id FROM universities WHERE id=$1", [universityId]);
    const year = await one<{ id: number; university_id: string }>("SELECT id,university_id FROM academic_years WHERE id=$1", [yearId]);
    if (!university || Number(university.college_id) !== collegeId || !year || Number(year.university_id) !== universityId) {
      return Response.json({ error: "Choose your college, university, and year in order" }, { status: 400 });
    }
    const exists = await one("SELECT id FROM users WHERE email=$1", [email]);
    if (exists) return Response.json({ error: "An account already exists for this email" }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12);
    const deviceId = await getOrCreateDeviceId();
    const user = await one<{ id: number; email: string; role: "student" }>(
      `INSERT INTO users (email,password_hash,name,phone,whatsapp,country,city,specialty,college_id,university_id,year_id,role,status,trusted_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'student','pending',$12) RETURNING id,email,role`,
      [email, passwordHash, name, phone, clean(body.whatsapp, 30), clean(body.country, 80), clean(body.city, 80), clean(body.specialty, 160), collegeId, universityId, yearId, deviceId],
    );
    if (!user) throw new Error("Account could not be created");
    await createSession(user, deviceId);
    return Response.json({ ok: true, redirect: "/workspace" }, { status: 201 });
  } catch (error) { return apiError(error, "Register error"); }
}