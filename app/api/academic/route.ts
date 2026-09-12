import { one, pool, rows } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";
import { apiError, clean } from "../../../lib/validation";

export const dynamic = "force-dynamic";

// Flat lists (not nested) — the client assembles the tree by matching parent ids.
// This mirrors how `courses`/`lessons` are already shipped to the client elsewhere
// in the app, and keeps this endpoint trivial to cache. Public and unauthenticated
// on purpose: the registration form needs it before an account exists, the same way
// /api/courses is a public catalog.
export async function GET() {
  try {
    const [colleges, universities, years, terms, subjects] = await Promise.all([
      rows(`SELECT id,name_ar AS "nameAr",name_en AS "nameEn",sort_order AS "sortOrder" FROM colleges ORDER BY sort_order,id`),
      rows(`SELECT id,college_id AS "collegeId",name_ar AS "nameAr",name_en AS "nameEn",sort_order AS "sortOrder" FROM universities ORDER BY sort_order,id`),
      rows(`SELECT id,university_id AS "universityId",year_number AS "yearNumber",name_ar AS "nameAr",name_en AS "nameEn" FROM academic_years ORDER BY university_id,year_number`),
      rows(`SELECT id,year_id AS "yearId",term_number AS "termNumber",name_ar AS "nameAr",name_en AS "nameEn" FROM terms ORDER BY year_id,term_number`),
      rows(`SELECT id,term_id AS "termId",name_ar AS "nameAr",name_en AS "nameEn" FROM subjects ORDER BY term_id,id`),
    ]);
    return Response.json({ colleges, universities, years, terms, subjects });
  } catch (error) { return apiError(error, "Academic GET error"); }
}

export async function POST(request: Request) {
  try {
    const access = await requireUser();
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    if (access.user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};

    if (action === "addCollege") {
      const nameAr = clean(data.nameAr, 160), nameEn = clean(data.nameEn, 160);
      if (!nameAr || !nameEn) return Response.json({ error: "Arabic and English names are required" }, { status: 400 });
      const row = await one<{ id: number }>("INSERT INTO colleges (name_ar,name_en,sort_order) VALUES ($1,$2,$3) RETURNING id", [nameAr, nameEn, Math.floor(Number(data.sortOrder)) || 0]);
      return Response.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "addUniversity") {
      const collegeId = Number(data.collegeId), nameAr = clean(data.nameAr, 160), nameEn = clean(data.nameEn, 160);
      if (!Number.isInteger(collegeId) || !nameAr || !nameEn) return Response.json({ error: "College, Arabic name, and English name are required" }, { status: 400 });
      if (!await one("SELECT id FROM colleges WHERE id=$1", [collegeId])) return Response.json({ error: "College not found" }, { status: 404 });
      const row = await one<{ id: number }>("INSERT INTO universities (college_id,name_ar,name_en,sort_order) VALUES ($1,$2,$3,$4) RETURNING id", [collegeId, nameAr, nameEn, Math.floor(Number(data.sortOrder)) || 0]);
      return Response.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "addYear") {
      const universityId = Number(data.universityId), yearNumber = Math.floor(Number(data.yearNumber));
      const nameAr = clean(data.nameAr, 60), nameEn = clean(data.nameEn, 60);
      if (!Number.isInteger(universityId) || yearNumber < 1 || yearNumber > 8 || !nameAr || !nameEn) return Response.json({ error: "University, a valid year number (1-8), and names are required" }, { status: 400 });
      if (!await one("SELECT id FROM universities WHERE id=$1", [universityId])) return Response.json({ error: "University not found" }, { status: 404 });
      const row = await one<{ id: number }>("INSERT INTO academic_years (university_id,year_number,name_ar,name_en) VALUES ($1,$2,$3,$4) RETURNING id", [universityId, yearNumber, nameAr, nameEn]);
      return Response.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "addTerm") {
      const yearId = Number(data.yearId), termNumber = Math.floor(Number(data.termNumber));
      const nameAr = clean(data.nameAr, 60), nameEn = clean(data.nameEn, 60);
      if (!Number.isInteger(yearId) || termNumber < 1 || termNumber > 4 || !nameAr || !nameEn) return Response.json({ error: "Academic year, a valid term number (1-4), and names are required" }, { status: 400 });
      if (!await one("SELECT id FROM academic_years WHERE id=$1", [yearId])) return Response.json({ error: "Academic year not found" }, { status: 404 });
      const row = await one<{ id: number }>("INSERT INTO terms (year_id,term_number,name_ar,name_en) VALUES ($1,$2,$3,$4) RETURNING id", [yearId, termNumber, nameAr, nameEn]);
      return Response.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "addSubject") {
      const termId = Number(data.termId), nameAr = clean(data.nameAr, 160), nameEn = clean(data.nameEn, 160);
      if (!Number.isInteger(termId) || !nameAr || !nameEn) return Response.json({ error: "Term, Arabic name, and English name are required" }, { status: 400 });
      if (!await one("SELECT id FROM terms WHERE id=$1", [termId])) return Response.json({ error: "Term not found" }, { status: 404 });
      const row = await one<{ id: number }>("INSERT INTO subjects (term_id,name_ar,name_en) VALUES ($1,$2,$3) RETURNING id", [termId, nameAr, nameEn]);
      return Response.json({ ok: true, id: row?.id }, { status: 201 });
    }

    if (action === "editCollege") {
      const id = Number(data.id), nameAr = clean(data.nameAr, 160), nameEn = clean(data.nameEn, 160);
      if (!Number.isInteger(id) || !nameAr || !nameEn) return Response.json({ error: "Arabic and English names are required" }, { status: 400 });
      await pool.query("UPDATE colleges SET name_ar=$1,name_en=$2 WHERE id=$3", [nameAr, nameEn, id]);
      return Response.json({ ok: true });
    }

    if (action === "editUniversity") {
      const id = Number(data.id), nameAr = clean(data.nameAr, 160), nameEn = clean(data.nameEn, 160);
      if (!Number.isInteger(id) || !nameAr || !nameEn) return Response.json({ error: "Arabic and English names are required" }, { status: 400 });
      await pool.query("UPDATE universities SET name_ar=$1,name_en=$2 WHERE id=$3", [nameAr, nameEn, id]);
      return Response.json({ ok: true });
    }

    if (action === "deleteCollege" || action === "deleteUniversity" || action === "deleteYear" || action === "deleteTerm" || action === "deleteSubject") {
      const id = Number(data.id);
      if (!Number.isInteger(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
      const table = { deleteCollege: "colleges", deleteUniversity: "universities", deleteYear: "academic_years", deleteTerm: "terms", deleteSubject: "subjects" }[action];
      // Deleting cascades to everything under it (universities/years/terms/subjects/
      // course_subjects/subject_locks) via the FKs declared in db/schema.sql.
      await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) { return apiError(error, "Academic POST error"); }
}