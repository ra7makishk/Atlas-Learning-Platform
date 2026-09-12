import bcrypt from "bcryptjs";
import { one } from "../../../../lib/db";
import { createSession, getOrCreateDeviceId } from "../../../../lib/auth";
import { apiError, clean, stageLevels } from "../../../../lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = clean(body.email, 160).toLowerCase();
    const password = clean(body.password, 200);
    const name = clean(body.name, 120);
    const phone = clean(body.phone, 30);
    const stage = clean(body.stage, 20);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !name || !phone) {
      return Response.json({ error: "Valid email, name, phone, and an 8-character password are required" }, { status: 400 });
    }
    if (!Object.keys(stageLevels).includes(stage)) {
      return Response.json({ error: "Choose your education stage" }, { status: 400 });
    }

    let collegeId: number | null = null, universityId: number | null = null, yearId: number | null = null, level = "";

    if (stage === "university") {
      collegeId = Number(body.collegeId); universityId = Number(body.universityId); yearId = Number(body.yearId);
      if (!Number.isInteger(collegeId) || !Number.isInteger(universityId) || !Number.isInteger(yearId)) {
        return Response.json({ error: "Choose your college, university, and year" }, { status: 400 });
      }
      // Every step has to actually belong to the one before it, or a mismatched
      // set of ids (sent directly to the API rather than picked in order in the UI)
      // would silently record the wrong academic placement.
      const university = await one<{ id: number; college_id: string }>("SELECT id,college_id FROM universities WHERE id=$1", [universityId]);
      const year = await one<{ id: number; university_id: string }>("SELECT id,university_id FROM academic_years WHERE id=$1", [yearId]);
      if (!university || Number(university.college_id) !== collegeId || !year || Number(year.university_id) !== universityId) {
        return Response.json({ error: "Choose your college, university, and year in order" }, { status: 400 });
      }
    } else if (stage === "high_school") {
      level = clean(body.level, 30);
      if (!stageLevels.high_school.includes(level)) {
        return Response.json({ error: "Choose your secondary school grade" }, { status: 400 });
      }
    }

    const exists = await one("SELECT id FROM users WHERE email=$1", [email]);
    if (exists) return Response.json({ error: "An account already exists for this email" }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12);
    const deviceId = await getOrCreateDeviceId();
    const user = await one<{ id: number; email: string; role: "student" }>(
      `INSERT INTO users (email,password_hash,name,phone,whatsapp,country,city,specialty,stage,level,college_id,university_id,year_id,role,status,trusted_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'student','pending',$14) RETURNING id,email,role`,
      [email, passwordHash, name, phone, clean(body.whatsapp, 30), clean(body.country, 80), clean(body.city, 80), clean(body.specialty, 160), stage, level, collegeId, universityId, yearId, deviceId],
    );
    if (!user) throw new Error("Account could not be created");
    await createSession(user, deviceId);
    return Response.json({ ok: true, redirect: "/workspace" }, { status: 201 });
  } catch (error) { return apiError(error, "Register error"); }
}