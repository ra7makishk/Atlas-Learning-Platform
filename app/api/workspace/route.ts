import { requireUser } from "../../../lib/auth";
import { one, pool, rows, withTransaction } from "../../../lib/db";
import { paymentDecision, type PaymentMethod } from "../../../lib/payments";
import { apiError, clean, stageLevels } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const courseFields = `SELECT c.id,c.slug,c.title_en AS "titleEn",c.title_ar AS "titleAr",c.category_en AS "categoryEn",c.category_ar AS "categoryAr",
c.summary_en AS "summaryEn",c.summary_ar AS "summaryAr",c.instructor_name AS "instructorName",c.instructor_email AS "instructorEmail",
c.whatsapp,c.price::float8 AS price,c.mode,c.image_url AS "imageUrl",c.level,c.duration,c.published,
COALESCE((SELECT array_agg(cs.subject_id ORDER BY cs.subject_id) FROM course_subjects cs WHERE cs.course_id=c.id),'{}') AS "subjectIds",
COALESCE((SELECT jsonb_agg(jsonb_build_object('collegeId',t.college_id,'universityId',t.university_id,'yearId',t.year_id)) FROM course_academic_targets t WHERE t.course_id=c.id),'[]') AS "targets"`;

function validAssetUrl(value: string) {
  if (value.startsWith("/api/")) return true;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}
const planTypes = ["full_curriculum", "mid_review", "before_mid", "after_mid", "final_review"];
function accessCode() { const bytes = crypto.getRandomValues(new Uint8Array(8)); return `4Z-${Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 12)}`; }

export async function GET() {
  try {
    const access = await requireUser();
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const user = access.user;
    const courses = user.role === "admin"
      ? await rows(`${courseFields} FROM courses c ORDER BY c.id`)
      : user.role === "instructor"
        ? await rows(`${courseFields} FROM courses c WHERE c.instructor_email=$1 ORDER BY c.id`, [user.email])
        : await rows(`${courseFields},e.payment_status AS "paymentStatus",e.status AS "enrollmentStatus",e.progress FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_email=$1 WHERE c.published=TRUE
          AND NOT EXISTS (SELECT 1 FROM course_subjects cs JOIN subject_locks sl ON sl.subject_id=cs.subject_id AND sl.student_email=$1 AND sl.course_id<>c.id WHERE cs.course_id=c.id)
          AND (e.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM course_academic_targets t WHERE t.course_id=c.id) OR EXISTS (SELECT 1 FROM course_academic_targets t WHERE t.course_id=c.id AND t.college_id=$2 AND t.university_id=$3 AND t.year_id=$4))
          ORDER BY c.id`, [user.email, user.collegeId, user.universityId, user.yearId]);
    const lessons = user.role === "student"
      ? await rows("SELECT DISTINCT l.id,l.course_id,l.title,l.kind,l.asset_url,l.duration,l.section_type,l.sort_order,l.published,l.created_at FROM lessons l JOIN enrollments e ON e.course_id=l.course_id JOIN access_codes a ON a.course_id=l.course_id AND a.student_email=e.user_email WHERE e.user_email=$1 AND e.payment_status='paid' AND e.status='active' AND l.published=TRUE AND a.status='redeemed' AND NOW() BETWEEN a.available_from AND a.available_until AND (a.plan_type='full_curriculum' OR l.section_type=a.section_type) AND (SELECT COUNT(*) FROM lessons l2 WHERE l2.course_id=l.course_id AND (a.plan_type='full_curriculum' OR l2.section_type=a.section_type) AND (l2.sort_order<l.sort_order OR (l2.sort_order=l.sort_order AND l2.id<=l.id)))<=a.section_limit ORDER BY l.course_id,l.sort_order,l.id", [user.email])
      : await rows("SELECT l.* FROM lessons l JOIN courses c ON c.id=l.course_id WHERE $1='admin' OR c.instructor_email=$2 ORDER BY l.course_id,l.sort_order,l.id", [user.role, user.email]);
    const enrollments = await rows(`SELECT e.*,c.title_en AS "courseTitle",u.name AS "studentName" FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN users u ON u.email=e.user_email WHERE $1='admin' OR e.user_email=$2 OR c.instructor_email=$3 ORDER BY e.id DESC`, [user.role, user.email, user.email]);
    const notifications = await rows(`SELECT n.*,c.title_en AS "courseTitle" FROM notifications n LEFT JOIN courses c ON c.id=n.course_id WHERE n.user_email=$1 ORDER BY n.id DESC LIMIT 50`, [user.email]);
    const messages = await rows(`SELECT m.*,c.title_en AS "courseTitle",s.name AS "senderName",r.name AS "receiverName" FROM messages m JOIN courses c ON c.id=m.course_id LEFT JOIN users s ON s.email=m.sender_email LEFT JOIN users r ON r.email=m.receiver_email WHERE m.sender_email=$1 OR m.receiver_email=$1 ORDER BY m.id ASC LIMIT 100`, [user.email]);
    const mediaAssets = user.role === "student"
      ? await rows(`SELECT a.id,a.course_id,'/api/files/' || a.id AS url,a.original_name AS "originalName",a.mime_type AS "mimeType",a.size_bytes::float8 AS "sizeBytes" FROM file_assets a JOIN enrollments e ON e.course_id=a.course_id WHERE e.user_email=$1 AND e.payment_status='paid' AND e.status='active' ORDER BY a.id DESC`, [user.email])
      : await rows(`SELECT a.id,a.course_id,'/api/files/' || a.id AS url,a.original_name AS "originalName",a.mime_type AS "mimeType",a.size_bytes::float8 AS "sizeBytes" FROM file_assets a JOIN courses c ON c.id=a.course_id WHERE $1='admin' OR c.instructor_email=$2 ORDER BY a.id DESC`, [user.role, user.email]);
    const [colleges, universities, years, terms, subjects] = await Promise.all([
      rows(`SELECT id,name_ar AS "nameAr",name_en AS "nameEn",sort_order AS "sortOrder" FROM colleges ORDER BY sort_order,id`),
      rows(`SELECT id,college_id AS "collegeId",name_ar AS "nameAr",name_en AS "nameEn",sort_order AS "sortOrder" FROM universities ORDER BY sort_order,id`),
      rows(`SELECT id,university_id AS "universityId",year_number AS "yearNumber",name_ar AS "nameAr",name_en AS "nameEn" FROM academic_years ORDER BY university_id,year_number`),
      rows(`SELECT id,year_id AS "yearId",term_number AS "termNumber",name_ar AS "nameAr",name_en AS "nameEn" FROM terms ORDER BY year_id,term_number`),
      rows(`SELECT id,term_id AS "termId",name_ar AS "nameAr",name_en AS "nameEn" FROM subjects ORDER BY term_id,id`),
    ]);
    const academic = { colleges, universities, years, terms, subjects };
    const subjectLocks = user.role === "admin"
      ? await rows(`SELECT sl.id,sl.student_email AS "studentEmail",sl.subject_id AS "subjectId",sl.course_id AS "courseId",sl.locked_at AS "lockedAt",s.name_en AS "subjectNameEn",s.name_ar AS "subjectNameAr",c.title_en AS "courseTitle",c.instructor_name AS "instructorName" FROM subject_locks sl JOIN subjects s ON s.id=sl.subject_id JOIN courses c ON c.id=sl.course_id ORDER BY sl.id DESC`)
      : user.role === "student"
        ? await rows(`SELECT sl.id,sl.subject_id AS "subjectId",sl.course_id AS "courseId",sl.locked_at AS "lockedAt",s.name_en AS "subjectNameEn",s.name_ar AS "subjectNameAr",c.title_en AS "courseTitle",c.instructor_name AS "instructorName" FROM subject_locks sl JOIN subjects s ON s.id=sl.subject_id JOIN courses c ON c.id=sl.course_id WHERE sl.student_email=$1 ORDER BY sl.id DESC`, [user.email])
        : [];
    let users: unknown[] = [], payments: unknown[] = [], deviceRequests: unknown[] = [], accessCodes: unknown[] = [];
    if (["admin", "instructor"].includes(user.role)) {
      users = user.role === "admin"
        ? await rows(`SELECT u.id,u.email,u.name,u.role,u.status,u.phone,u.whatsapp,u.country,u.city,u.specialty,u.stage,u.level,u.college_id AS "collegeId",u.university_id AS "universityId",u.year_id AS "yearId",u.trusted_device_id AS "trustedDeviceId",u.created_at AS "createdAt" FROM users u ORDER BY u.id DESC`)
        : await rows(`SELECT DISTINCT u.id,u.email,u.name,u.role,u.status,u.phone,u.whatsapp,u.country,u.city,u.specialty,u.stage,u.level,u.college_id AS "collegeId",u.university_id AS "universityId",u.year_id AS "yearId",u.created_at AS "createdAt" FROM users u JOIN enrollments e ON e.user_email=u.email JOIN courses c ON c.id=e.course_id WHERE c.instructor_email=$1 AND u.role='student' ORDER BY u.id DESC`, [user.email]);
      payments = user.role === "admin"
        ? await rows(`SELECT p.*,p.amount::float8 AS amount,c.title_en AS "courseTitle",u.name AS "studentName" FROM payments p JOIN courses c ON c.id=p.course_id LEFT JOIN users u ON u.email=p.user_email ORDER BY p.id DESC`)
        : await rows(`SELECT p.*,p.amount::float8 AS amount,c.title_en AS "courseTitle",u.name AS "studentName" FROM payments p JOIN courses c ON c.id=p.course_id LEFT JOIN users u ON u.email=p.user_email WHERE c.instructor_email=$1 ORDER BY p.id DESC`, [user.email]);
      if (user.role === "admin") deviceRequests = await rows("SELECT * FROM device_requests WHERE status='pending' ORDER BY id DESC");
      accessCodes = user.role === "admin"
        ? await rows(`SELECT a.*,c.title_en AS "courseTitle",u.name AS "studentName" FROM access_codes a JOIN courses c ON c.id=a.course_id LEFT JOIN users u ON u.email=a.student_email ORDER BY a.id DESC`)
        : await rows(`SELECT a.*,c.title_en AS "courseTitle",u.name AS "studentName" FROM access_codes a JOIN courses c ON c.id=a.course_id LEFT JOIN users u ON u.email=a.student_email WHERE c.instructor_email=$1 ORDER BY a.id DESC`, [user.email]);
    } else {
      accessCodes = await rows(`SELECT a.*,c.title_en AS "courseTitle" FROM access_codes a JOIN courses c ON c.id=a.course_id WHERE a.student_email=$1 ORDER BY a.id DESC`, [user.email]);
    }
    return Response.json({ user, courses, lessons, enrollments, notifications, messages, mediaAssets, users, payments, deviceRequests, accessCodes, subjectLocks, academic, demoPayments: String(process.env.PAYMENT_PROVIDER || "manual").toLowerCase() === "demo" });
  } catch (error) { return apiError(error, "Workspace GET error"); }
}

export async function POST(request: Request) {
  try {
    const access = await requireUser();
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 40);
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const user = access.user;

    if (action === "onboarding") {
      const choice = clean(data.choice, 10);
      if (!["yes", "no"].includes(choice)) return Response.json({ error: "Choose yes or no" }, { status: 400 });
      await pool.query("UPDATE users SET onboarding_choice=$1 WHERE email=$2", [choice, user.email]);
      return Response.json({ ok: true });
    }

    if (action === "profile") {
      const name = clean(data.name, 120), phone = clean(data.phone, 30);
      const stage = clean(data.stage, 20);
      if (!name || !phone || !Object.keys(stageLevels).includes(stage)) return Response.json({ error: "Name, phone, and your education stage are required" }, { status: 400 });

      let collegeId: number | null = null, universityId: number | null = null, yearId: number | null = null, level = "";

      if (stage === "university") {
        collegeId = Number(data.collegeId); universityId = Number(data.universityId); yearId = Number(data.yearId);
        if (!Number.isInteger(collegeId) || !Number.isInteger(universityId) || !Number.isInteger(yearId)) return Response.json({ error: "Choose your college, university, and year" }, { status: 400 });
        const university = await one<{ id: number; college_id: string }>("SELECT id,college_id FROM universities WHERE id=$1", [universityId]);
        const year = await one<{ id: number; university_id: string }>("SELECT id,university_id FROM academic_years WHERE id=$1", [yearId]);
        if (!university || Number(university.college_id) !== collegeId || !year || Number(year.university_id) !== universityId) return Response.json({ error: "Choose your college, university, and year in order" }, { status: 400 });
      } else if (stage === "high_school") {
        level = clean(data.level, 30);
        if (!stageLevels.high_school.includes(level)) return Response.json({ error: "Choose your secondary school grade" }, { status: 400 });
      }

      await pool.query(`UPDATE users SET name=$1,phone=$2,whatsapp=$3,country=$4,city=$5,specialty=$6,stage=$7,level=$8,college_id=$9,university_id=$10,year_id=$11,status=CASE WHEN status IN ('rejected','needs_changes') THEN 'pending' ELSE status END,updated_at=NOW() WHERE email=$12`, [name, phone, clean(data.whatsapp, 30), clean(data.country, 80), clean(data.city, 80), clean(data.specialty, 160), stage, level, collegeId, universityId, yearId, user.email]);
      return Response.json({ ok: true });
    }

    if (action === "reviewUser") {
      if (!["admin", "instructor"].includes(user.role)) return Response.json({ error: "Reviewer access required" }, { status: 403 });
      const email = clean(data.email, 160).toLowerCase(), status = clean(data.status, 30);
      if (!email || !["approved", "rejected", "needs_changes"].includes(status)) return Response.json({ error: "Invalid review" }, { status: 400 });
      await pool.query("UPDATE users SET status=$1,updated_at=NOW() WHERE email=$2 AND role='student'", [status, email]);
      await pool.query("INSERT INTO notifications (user_email,title,message) VALUES ($1,$2,$3)", [email, "Profile review updated", `Your student profile is now ${status.replace("_", " ")}.`]);
      return Response.json({ ok: true });
    }

    if (action === "setRole") {
      if (user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
      const email = clean(data.email, 160).toLowerCase(), role = clean(data.role, 30);
      if (!email || !["student", "instructor"].includes(role)) return Response.json({ error: "Invalid role" }, { status: 400 });
      await pool.query("UPDATE users SET role=$1,status='approved',updated_at=NOW() WHERE email=$2", [role, email]);
      return Response.json({ ok: true });
    }

if (action === "generateAccessCode") {
  if (user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
  const courseId=Number(data.courseId), planType=clean(data.planType,40), sectionType=planType==="full_curriculum"?"full_curriculum":clean(data.sectionType,40)||planType;
  const sectionLimit=Math.min(200,Math.max(1,Math.floor(Number(data.sectionLimit)||1))), days=Math.min(730,Math.max(1,Math.floor(Number(data.availabilityDays)||30)));
  const count=Math.min(300,Math.max(1,Math.floor(Number(data.count)||1)));
  if (!await one("SELECT id FROM courses WHERE id=$1",[courseId]) || !planTypes.includes(planType) || !planTypes.includes(sectionType)) return Response.json({error:"Choose a valid course and subscription plan"},{status:400});
  const starts=new Date(), ends=new Date(starts.getTime()+days*86400000);
  const codes:string[]=[];
  for (let i=0;i<count;i++){
    const code=accessCode();
    await pool.query("INSERT INTO access_codes(code,student_email,course_id,plan_type,section_type,section_limit,available_from,available_until,status,created_by) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,'active',$8)",[code,courseId,planType,sectionType,sectionLimit,starts,ends,user.email]);
    codes.push(code);
  }
  return Response.json({ok:true,codes},{status:201});
}

if (action === "redeemAccessCode") {
  if (user.role !== "student") return Response.json({error:"Student access required"},{status:403});
  const code=clean(data.code,40).toUpperCase(); const grant=await one<{id:number;course_id:number}>("SELECT id,course_id FROM access_codes WHERE code=$1 AND student_email IS NULL AND status='active' AND NOW() BETWEEN available_from AND available_until",[code]);
  if(!grant) return Response.json({error:"This code is invalid, expired, or already used"},{status:400});
  // Every subject this course satisfies. A course with no subjects linked yet
  // (not assigned through "setSubjects") is treated as unrestricted, so existing
  // courses keep working exactly as before until an admin assigns subjects to them.
  const subjectIds=(await rows<{subject_id:number}>("SELECT subject_id FROM course_subjects WHERE course_id=$1",[grant.course_id])).map((row)=>row.subject_id);
  if (subjectIds.length) {
    const conflict=await one<{subject_name:string;course_title:string}>(
      "SELECT s.name_en AS subject_name,c.title_en AS course_title FROM subject_locks sl JOIN subjects s ON s.id=sl.subject_id JOIN courses c ON c.id=sl.course_id WHERE sl.student_email=$1 AND sl.subject_id=ANY($2::bigint[]) AND sl.course_id<>$3 LIMIT 1",
      [user.email,subjectIds,grant.course_id]
    );
    if (conflict) return Response.json({error:`You already have access to "${conflict.subject_name}" through another instructor (${conflict.course_title}). Ask an administrator to unlock it if this instructor changed.`},{status:409});
  }
  await withTransaction(async(client)=>{
    await client.query("UPDATE access_codes SET status='redeemed',student_email=$2,redeemed_at=NOW() WHERE id=$1",[grant.id,user.email]);
    await client.query("INSERT INTO enrollments(user_email,course_id,payment_status,status) VALUES($1,$2,'paid','active') ON CONFLICT(user_email,course_id) DO UPDATE SET payment_status='paid',status='active'",[user.email,grant.course_id]);
    for (const subjectId of subjectIds) await client.query("INSERT INTO subject_locks(student_email,subject_id,course_id) VALUES($1,$2,$3) ON CONFLICT(student_email,subject_id) DO NOTHING",[user.email,subjectId,grant.course_id]);
    await client.query("INSERT INTO notifications(user_email,course_id,title,message) VALUES($1,$2,$3,$4)",[user.email,grant.course_id,"Course access activated","Your personal course access is now active."]);
  });
  return Response.json({ok:true});
}

if (action === "unlockSubject") {
  // Manual admin override for the one case the automatic lock can't judge itself:
  // the instructor changed, or the lock was a mistake. Deleting the row simply lets
  // the student redeem a code for a different course under the same subject again.
  if (user.role !== "admin") return Response.json({error:"Administrator access required"},{status:403});
  const id = Number(data.id);
  if (!Number.isInteger(id)) return Response.json({error:"Invalid lock"},{status:400});
  await pool.query("DELETE FROM subject_locks WHERE id=$1",[id]);
  return Response.json({ok:true});
}

    if (action === "revokeAccessCode") { if(user.role!=="admin") return Response.json({error:"Administrator access required"},{status:403}); await pool.query("UPDATE access_codes SET status='revoked' WHERE id=$1",[Number(data.id)]); return Response.json({ok:true}); }

    if (action === "enroll") {
      if (user.role !== "student" || user.status !== "approved") return Response.json({ error: "Approved student profile required" }, { status: 403 });
      const courseId = Number(data.courseId), method = clean(data.method, 40) as PaymentMethod;
      const reference = clean(data.reference, 120);
      if (!(["test_card", "visa", "wallet", "cash_transfer"] as string[]).includes(method)) return Response.json({ error: "Invalid payment method" }, { status: 400 });
      if (method === "test_card" && String(process.env.PAYMENT_PROVIDER || "manual").toLowerCase() !== "demo") return Response.json({ error: "Test payments are disabled" }, { status: 403 });
      if (method !== "test_card" && !reference) return Response.json({ error: "A payment reference is required" }, { status: 400 });
      const course = await one<{ price: number }>("SELECT price::float8 AS price FROM courses WHERE id=$1 AND published=TRUE", [courseId]);
      if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
      const existingEnrollment = await one<{ payment_status: string; status: string }>("SELECT payment_status,status FROM enrollments WHERE user_email=$1 AND course_id=$2", [user.email, courseId]);
      if (existingEnrollment?.payment_status === "paid" && existingEnrollment.status === "active") return Response.json({ error: "You already have access to this course" }, { status: 409 });
      if (existingEnrollment?.payment_status === "pending" && existingEnrollment.status === "pending") return Response.json({ error: "A payment request is already waiting for review" }, { status: 409 });
      const subjectIds = (await rows<{ subject_id: number }>("SELECT subject_id FROM course_subjects WHERE course_id=$1", [courseId])).map((row) => row.subject_id);
      if (subjectIds.length) {
        const conflict = await one<{ subject_name: string; course_title: string }>(
          "SELECT s.name_en AS subject_name,c.title_en AS course_title FROM subject_locks sl JOIN subjects s ON s.id=sl.subject_id JOIN courses c ON c.id=sl.course_id WHERE sl.student_email=$1 AND sl.subject_id=ANY($2::bigint[]) AND sl.course_id<>$3 LIMIT 1",
          [user.email, subjectIds, courseId]
        );
        if (conflict) return Response.json({ error: `You already have access to "${conflict.subject_name}" through another instructor (${conflict.course_title}). Ask an administrator to unlock it if this instructor changed.` }, { status: 409 });
      }
      const decision = paymentDecision(method);
      const payment = await one<{ id: number }>(`INSERT INTO payments (user_email,course_id,amount,method,reference,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [user.email, courseId, course.price, method, reference, decision.status]);
      await pool.query(`INSERT INTO enrollments (user_email,course_id,payment_status,status) VALUES ($1,$2,$3,$4) ON CONFLICT (user_email,course_id) DO UPDATE SET payment_status=EXCLUDED.payment_status,status=EXCLUDED.status`, [user.email, courseId, decision.paid ? "paid" : "pending", decision.paid ? "active" : "pending"]);
      if (decision.paid) for (const subjectId of subjectIds) await pool.query("INSERT INTO subject_locks(student_email,subject_id,course_id) VALUES($1,$2,$3) ON CONFLICT(student_email,subject_id) DO NOTHING", [user.email, subjectId, courseId]);
      await pool.query("INSERT INTO notifications (user_email,course_id,title,message) VALUES ($1,$2,$3,$4)", [user.email, courseId, decision.paid ? "Enrollment confirmed" : "Payment under review", decision.paid ? "Your course is now available in My learning." : "An administrator will review the payment details."]);
      return Response.json({ ok: true, paid: decision.paid, paymentId: payment?.id, checkoutUrl: decision.checkoutUrl });
    }

    if (action === "reviewPayment") {
      if (user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
      const id = Number(data.id), status = clean(data.status, 30);
      if (!Number.isInteger(id) || !["paid", "rejected", "refunded"].includes(status)) return Response.json({ error: "Invalid payment review" }, { status: 400 });
      const payment = await one<{ user_email: string; course_id: number }>("SELECT user_email,course_id FROM payments WHERE id=$1", [id]);
      if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });
      let subjectIds: number[] = [];
      if (status === "paid") {
        subjectIds = (await rows<{ subject_id: number }>("SELECT subject_id FROM course_subjects WHERE course_id=$1", [payment.course_id])).map((row) => row.subject_id);
        if (subjectIds.length) {
          // Guards against two competing "pending" payments for the same subject (two
          // different instructors) both getting approved — whichever is approved first
          // wins the lock; approving the second must be refused, not silently applied.
          const conflict = await one<{ subject_name: string; course_title: string }>(
            "SELECT s.name_en AS subject_name,c.title_en AS course_title FROM subject_locks sl JOIN subjects s ON s.id=sl.subject_id JOIN courses c ON c.id=sl.course_id WHERE sl.student_email=$1 AND sl.subject_id=ANY($2::bigint[]) AND sl.course_id<>$3 LIMIT 1",
            [payment.user_email, subjectIds, payment.course_id]
          );
          if (conflict) return Response.json({ error: `This student already has "${conflict.subject_name}" locked to another instructor (${conflict.course_title}). Reject this payment or unlock the subject first.` }, { status: 409 });
        }
      }
      await withTransaction(async (client) => {
        await client.query("UPDATE payments SET status=$1,updated_at=NOW() WHERE id=$2", [status, id]);
        await client.query("UPDATE enrollments SET payment_status=$1,status=$2 WHERE user_email=$3 AND course_id=$4", [status, status === "paid" ? "active" : "blocked", payment.user_email, payment.course_id]);
        for (const subjectId of subjectIds) await client.query("INSERT INTO subject_locks(student_email,subject_id,course_id) VALUES($1,$2,$3) ON CONFLICT(student_email,subject_id) DO NOTHING", [payment.user_email, subjectId, payment.course_id]);
        await client.query("INSERT INTO notifications (user_email,course_id,title,message) VALUES ($1,$2,$3,$4)", [payment.user_email, payment.course_id, "Payment status updated", `Your payment is now ${status}.`]);
      });
      return Response.json({ ok: true });
    }

    if (action === "addLesson") {
      if (!["admin", "instructor"].includes(user.role)) return Response.json({ error: "Instructor access required" }, { status: 403 });
      const courseId = Number(data.courseId);
      const course = await one<{ instructor_email: string }>("SELECT instructor_email FROM courses WHERE id=$1", [courseId]);
      if (!course || (user.role === "instructor" && course.instructor_email !== user.email)) return Response.json({ error: "You cannot edit this course" }, { status: 403 });
      const title = clean(data.title, 160), kind = clean(data.kind, 30) || "video", assetUrl = clean(data.assetUrl, 500), duration = clean(data.duration, 80);
      if (!title || !["video", "live", "file"].includes(kind)) return Response.json({ error: "Valid lesson title and type are required" }, { status: 400 });
      if (!assetUrl || !validAssetUrl(assetUrl)) return Response.json({ error: kind === "live" ? "Add a secure HTTPS meeting link" : "Upload a file or add a secure HTTPS media link" }, { status: 400 });
      if (kind === "live" && !duration) return Response.json({ error: "Add the live session date and time" }, { status: 400 });
      const order = await one<{ total: number }>("SELECT COUNT(*)::int AS total FROM lessons WHERE course_id=$1", [courseId]);
      const sectionType = clean(data.sectionType, 40) || "full_curriculum";
      if (!planTypes.includes(sectionType)) return Response.json({ error: "Invalid section type" }, { status: 400 });
      await pool.query("INSERT INTO lessons (course_id,title,kind,asset_url,duration,section_type,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)", [courseId, title, kind, assetUrl, duration, sectionType, Number(order?.total || 0) + 1]);
      await pool.query(`INSERT INTO notifications (user_email,course_id,title,message) SELECT user_email,$1,$2,$3 FROM enrollments WHERE course_id=$1 AND payment_status='paid' AND status='active'`, [courseId, "New course material", `${title} is now available.`]);
      return Response.json({ ok: true }, { status: 201 });
    }

    if (action === "deleteLesson" || action === "moveLesson") {
      if (!["admin", "instructor"].includes(user.role)) return Response.json({ error: "Instructor access required" }, { status: 403 });
      const id = Number(data.id);
      const lesson = await one<{ id: number; course_id: number; sort_order: number; instructor_email: string }>(`SELECT l.id,l.course_id,l.sort_order,c.instructor_email FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1`, [id]);
      if (!lesson || (user.role === "instructor" && lesson.instructor_email !== user.email)) return Response.json({ error: "Lesson access denied" }, { status: 403 });
      if (action === "deleteLesson") {
        await pool.query("DELETE FROM lessons WHERE id=$1", [id]);
        return Response.json({ ok: true });
      }
      const direction = clean(data.direction, 10);
      const neighbor = direction === "up"
        ? await one<{ id: number; sort_order: number }>("SELECT id,sort_order FROM lessons WHERE course_id=$1 AND sort_order<$2 ORDER BY sort_order DESC,id DESC LIMIT 1", [lesson.course_id, lesson.sort_order])
        : await one<{ id: number; sort_order: number }>("SELECT id,sort_order FROM lessons WHERE course_id=$1 AND sort_order>$2 ORDER BY sort_order ASC,id ASC LIMIT 1", [lesson.course_id, lesson.sort_order]);
      if (neighbor) {
        await withTransaction(async (client) => {
          await client.query("UPDATE lessons SET sort_order=$1 WHERE id=$2", [neighbor.sort_order, lesson.id]);
          await client.query("UPDATE lessons SET sort_order=$1 WHERE id=$2", [lesson.sort_order, neighbor.id]);
        });
      }
      return Response.json({ ok: true });
    }

    if (action === "sendMessage") {
      const courseId = Number(data.courseId), receiverEmail = clean(data.receiverEmail, 160).toLowerCase(), bodyText = clean(data.body, 1500);
      if (!Number.isInteger(courseId) || !receiverEmail || !bodyText) return Response.json({ error: "Course, recipient, and message are required" }, { status: 400 });
      const course = await one<{ instructor_email: string }>("SELECT instructor_email FROM courses WHERE id=$1", [courseId]);
      if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
      if (user.role === "student") {
        const enrollment = await one("SELECT id FROM enrollments WHERE user_email=$1 AND course_id=$2 AND payment_status='paid' AND status='active'", [user.email, courseId]);
        if (!enrollment) return Response.json({ error: "Paid enrollment is required" }, { status: 403 });
        if (receiverEmail !== course.instructor_email) return Response.json({ error: "Students can only message this course's instructor" }, { status: 403 });
      } else {
        if (user.role === "instructor" && course.instructor_email !== user.email) return Response.json({ error: "Course access denied" }, { status: 403 });
        const enrollment = await one("SELECT id FROM enrollments WHERE user_email=$1 AND course_id=$2 AND payment_status='paid' AND status='active'", [receiverEmail, courseId]);
        if (!enrollment) return Response.json({ error: "Choose a student with active paid access to this course" }, { status: 400 });
      }
      const receiver = await one("SELECT id FROM users WHERE email=$1", [receiverEmail]);
      if (!receiver) return Response.json({ error: "Recipient account not found" }, { status: 404 });
      await pool.query("INSERT INTO messages (course_id,lesson_id,sender_email,receiver_email,body) VALUES ($1,$2,$3,$4,$5)", [courseId, Number(data.lessonId) || null, user.email, receiverEmail, bodyText]);
      await pool.query("INSERT INTO notifications (user_email,course_id,title,message) VALUES ($1,$2,$3,$4)", [receiverEmail, courseId, "New course message", `New message from ${user.name}.`]);
      return Response.json({ ok: true }, { status: 201 });
    }

    if (action === "markNotificationsRead") {
      await pool.query("UPDATE notifications SET read=TRUE WHERE user_email=$1", [user.email]);
      return Response.json({ ok: true });
    }

    if (action === "markNotificationRead") {
      await pool.query("UPDATE notifications SET read=TRUE WHERE id=$1 AND user_email=$2", [Number(data.id), user.email]);
      return Response.json({ ok: true });
    }

    if (action === "approveDevice") {
      if (user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
      const id = Number(data.id);
      const row = await one<{ user_email: string; requested_device_id: string }>("SELECT user_email,requested_device_id FROM device_requests WHERE id=$1 AND status='pending'", [id]);
      if (!row) return Response.json({ error: "Device request not found" }, { status: 404 });
      await withTransaction(async (client) => {
        await client.query("UPDATE users SET trusted_device_id=$1,updated_at=NOW() WHERE email=$2", [row.requested_device_id, row.user_email]);
        await client.query("UPDATE device_requests SET status='approved',reviewed_at=NOW() WHERE id=$1", [id]);
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) { return apiError(error, "Workspace POST error"); }
}