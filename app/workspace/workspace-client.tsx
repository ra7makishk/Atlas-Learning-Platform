"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformUser } from "../../lib/types";

type AnyRow = Record<string, string | number | boolean | null>;
type AcademicData = {
  colleges: { id: number; nameEn: string; nameAr: string; sortOrder: number }[];
  universities: { id: number; collegeId: number; nameEn: string; nameAr: string; sortOrder: number }[];
  years: { id: number; universityId: number; yearNumber: number; nameEn: string; nameAr: string }[];
  terms: { id: number; yearId: number; termNumber: number; nameEn: string; nameAr: string }[];
  subjects: { id: number; termId: number; nameEn: string; nameAr: string }[];
};
type WorkspaceData = {
  user: PlatformUser;
  courses: AnyRow[];
  lessons: AnyRow[];
  enrollments: AnyRow[];
  notifications: AnyRow[];
  messages: AnyRow[];
  mediaAssets: AnyRow[];
  users: AnyRow[];
  payments: AnyRow[];
  deviceRequests: AnyRow[];
  accessCodes: AnyRow[];
  subjectLocks: AnyRow[];
  academic: AcademicData;
  demoPayments: boolean;
};

const emptyAcademic: AcademicData = { colleges: [], universities: [], years: [], terms: [], subjects: [] };
const emptyData: WorkspaceData = { user: {} as PlatformUser, courses: [], lessons: [], enrollments: [], notifications: [], messages: [], mediaAssets: [], users: [], payments: [], deviceRequests: [], accessCodes: [], subjectLocks: [], academic: emptyAcademic, demoPayments: false };

const labels = {
  en: { overview: "Overview", courses: "Courses", studio: "Video & live", instructors: "Instructors", access: "Access codes", students: "Students", payments: "Payments", devices: "Devices", messages: "Messages", learning: "My learning", activate: "Activate code", discover: "Discover", notifications: "Notifications", profile: "Profile", protection: "Player demo", academic: "Academic structure" },
  ar: { overview: "نظرة عامة", courses: "الكورسات", studio: "الفيديو والبث", instructors: "المدرسين", access: "أكواد الاشتراك", students: "الطلاب", payments: "المدفوعات", devices: "الأجهزة", messages: "الرسائل", learning: "تعليمي", activate: "تفعيل كود", discover: "استكشف", notifications: "الإشعارات", profile: "البيانات", protection: "مشغل الحماية", academic: "Academic structure" },
};
const planLabels: Record<string,string> = { full_curriculum:"Full curriculum · منهج كامل", mid_review:"Midterm review · مراجعة الميد", before_mid:"Before midterm · قبل الميد", after_mid:"After midterm · بعد الميد", final_review:"Final review · مراجعة فاينل" };

function value(row: AnyRow, camel: string, snake?: string) {
  return row[camel] ?? (snake ? row[snake] : undefined) ?? "";
}

function isSecureUrl(input: string) {
  if (input.startsWith("/api/")) return true;
  try { return new URL(input).protocol === "https:"; }
  catch { return false; }
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`The server returned an unreadable response (${response.status}).`); }
}

function uploadProtectedFile(file: File, courseId: number, onProgress: (percent: number) => void) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("courseId", String(courseId));
    form.append("kind", "lesson");
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onerror = () => reject(new Error("The upload was interrupted. Choose the file and try again."));
    request.onload = () => {
      let payload: Record<string, unknown> = {};
      try { payload = request.responseText ? JSON.parse(request.responseText) as Record<string, unknown> : {}; }
      catch { reject(new Error("The server returned an unreadable upload response.")); return; }
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(String(payload.error || "Upload failed")));
    };
    request.send(form);
  });
}

function deviceId() {
  const key = "atlas_trusted_device";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `atlas-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

function Stat({ label, number, note }: { label: string; number: string | number; note: string }) {
  return <article className="workspace-stat"><p>{label}</p><strong>{number}</strong><span>{note}</span></article>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state"><b>✦</b><p>{children}</p></div>;
}

export default function WorkspaceClient({ initialUser, signOutHref }: { initialUser: PlatformUser; signOutHref: string }) {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [active, setActive] = useState("overview");
  const [data, setData] = useState<WorkspaceData>({ ...emptyData, user: initialUser });
  const [device] = useState(() => typeof window === "undefined" ? "" : deviceId());
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const role = data.user?.role || initialUser.role;
  const needsOnboarding = role === "student" && data.user.status === "approved" && !data.user.onboardingChoice;
  const t = labels[locale];

  const load = useCallback(async (knownDevice?: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store", headers: { "x-atlas-device": knownDevice || device } });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Could not load the workspace"));
      setData(payload as unknown as WorkspaceData);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load the workspace"); }
    finally { setBusy(false); }
  }, [device]);

  useEffect(() => {
    if (!device) return;
    const start = window.setTimeout(() => void load(device), 0);
    return () => window.clearTimeout(start);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const act = async (action: string, actionData: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json", "x-atlas-device": device }, body: JSON.stringify({ action, data: actionData }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Action failed"));
      setNotice("Saved successfully.");
      await load();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); setBusy(false); return false; }
  };

  const saveCourse = async (course: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", data: course }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Course could not be saved"));
      setNotice(course.id ? "Course updated." : "Course saved as a draft. Publish it when it is ready.");
      await load();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course could not be saved"); setBusy(false); return false; }
  };

  const manageCourse = async (action: "publish" | "delete", course: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data: course }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Course action failed"));
      setNotice(action === "delete" ? "Course deleted." : "Course visibility updated.");
      await load();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Course action failed"); setBusy(false); return false; }
  };

  const saveSubjects = async (courseId: number, subjectIds: number[]) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setSubjects", data: { id: courseId, subjectIds } }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Subjects could not be saved"));
      setNotice("This course's subjects were updated.");
      await load();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Subjects could not be saved"); setBusy(false); return false; }
  };

  const academicAction = async (action: string, actionData: Record<string, unknown>) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/academic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data: actionData }) });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.error || "Action failed"));
      setNotice("Saved successfully.");
      await load();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); setBusy(false); return false; }
  };

  const managerNav = role === "admin"
    ? [["overview", t.overview], ["courses", t.courses], ["studio", t.studio], ["academic", t.academic], ["instructors", t.instructors], ["access", t.access], ["students", t.students], ["payments", t.payments], ["devices", t.devices], ["notifications", t.notifications], ["messages", t.messages], ["protection", t.protection]]
    : [["overview", t.overview], ["courses", t.courses], ["studio", t.studio], ["students", t.students], ["notifications", t.notifications], ["messages", t.messages], ["protection", t.protection]];
  const studentNav = [["learning", t.learning], ["activate", t.activate], ["discover", t.discover], ["notifications", t.notifications], ["messages", t.messages], ["profile", t.profile]];
  const nav = role === "student" ? studentNav : managerNav;

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/"><img src="/assets/4z-academy-logo.png" alt="" /><b>4Z ACADEMY</b><small>LEARNING PLATFORM</small></Link>
        <nav>{nav.map(([id, label], index) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><i>{String(index + 1).padStart(2, "0")}</i>{label}{id === "notifications" && data.notifications.some((row) => !row.read) ? <em>{data.notifications.filter((row) => !row.read).length}</em> : null}</button>)}</nav>
        <div className="workspace-profile"><span>{data.user?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("") || "A"}</span><div><b>{data.user?.name}</b><small>{role} · {data.user?.status}</small></div></div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div><p>{role === "student" ? "LEARNING SPACE" : "CONTROL ROOM"}</p><h1>{nav.find(([id]) => id === active)?.[1] || t.overview}</h1></div>
          <div className="workspace-top-actions"><button onClick={() => setLocale(locale === "en" ? "ar" : "en")}>{locale === "en" ? "العربية" : "English"}</button><Link href="/">Live site ↗</Link><a href={signOutHref}>Sign out</a></div>
        </header>

        {error && <div className="workspace-alert error"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
        {notice && <div className="workspace-alert success"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
        {busy && <div className="workspace-loader"><i /><span>Syncing your learning space…</span></div>}

        {!busy && role === "student" && data.user.status !== "approved" ? <PendingProfile user={data.user} academic={data.academic} act={act} /> : null}
        {!busy && needsOnboarding ? <OnboardingGate act={act} onAnswered={(choice) => setActive(choice === "yes" ? "activate" : "discover")} /> : null}
        {!busy && !needsOnboarding && (role !== "student" || data.user.status === "approved") && active === "overview" && <ManagerOverview data={data} role={role} />}
        {!busy && active === "courses" && role !== "student" && <CourseManager courses={data.courses} saveCourse={saveCourse} manageCourse={manageCourse} saveSubjects={saveSubjects} academic={data.academic} role={role} />}
        {!busy && active === "studio" && role !== "student" && <ContentStudio courses={data.courses} lessons={data.lessons} act={act} />}
        {!busy && active === "academic" && role === "admin" && <AcademicManager academic={data.academic} act={academicAction} />}
        {!busy && active === "instructors" && role === "admin" && <InstructorManager data={data} />}
        {!busy && active === "access" && role === "admin" && <AccessCodeManager data={data} act={act} />}
        {!busy && active === "students" && role !== "student" && <StudentManager users={data.users} enrollments={data.enrollments} academic={data.academic} role={role} act={act} />}
        {!busy && active === "payments" && role === "admin" && <PaymentManager payments={data.payments} act={act} />}
        {!busy && active === "devices" && role === "admin" && <DeviceManager rows={data.deviceRequests} act={act} />}
        {!busy && active === "protection" && role !== "student" && <ProtectedPlayer name={data.user.name} email={data.user.email} />}
        {!busy && !needsOnboarding && active === "learning" && role === "student" && data.user.status === "approved" && <MyLearning data={data} />}
        {!busy && !needsOnboarding && active === "activate" && role === "student" && data.user.status === "approved" && <ActivateCode accessCodes={data.accessCodes} act={act} />}
        {!busy && !needsOnboarding && active === "discover" && role === "student" && data.user.status === "approved" && <Discover courses={data.courses} demoPayments={data.demoPayments} act={act} />}
        {!busy && !needsOnboarding && active === "notifications" && (role !== "student" || data.user.status === "approved") && <Notifications rows={data.notifications} act={act} />}
        {!busy && !needsOnboarding && active === "messages" && (role !== "student" || data.user.status === "approved") && <Messages data={data} act={act} />}
        {!busy && !needsOnboarding && active === "profile" && role === "student" && data.user.status === "approved" && <ProfileForm user={data.user} academic={data.academic} act={act} />}
      </section>
    </main>
  );
}

function ManagerOverview({ data, role }: { data: WorkspaceData; role: string }) {
  const students = data.users.filter((user) => user.role === "student");
  const pending = students.filter((user) => user.status === "pending").length;
  const revenue = data.payments.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return <div className="workspace-stack">{role === "admin" && data.demoPayments ? <section className="launch-warning"><b>Test payment mode is ON</b><p>Students can receive instant access with the test card. Change <code>PAYMENT_PROVIDER=manual</code> in <code>.env</code> and restart before public launch.</p></section> : null}<section className="workspace-stats"><Stat label="Active courses" number={data.courses.filter((course) => Boolean(course.published)).length} note="Publicly visible" /><Stat label="Student profiles" number={students.length} note={`${pending} waiting for review`} /><Stat label="Paid enrollments" number={data.enrollments.filter((row) => row.payment_status === "paid").length} note="Access is active" /><Stat label="Verified revenue" number={`${revenue.toLocaleString()} EGP`} note={role === "admin" ? "Approved payments" : "Platform total"} /></section><section className="workspace-panel"><div className="panel-heading"><div><p>OPERATIONS</p><h2>Today at a glance</h2></div><span className="status-chip">Live data</span></div><div className="activity-grid"><article><b>{pending}</b><span>profiles need a decision</span></article><article><b>{data.payments.filter((row) => row.status === "pending").length}</b><span>payments need review</span></article><article><b>{data.deviceRequests.length}</b><span>device change requests</span></article><article><b>{data.messages.length}</b><span>recent conversations</span></article></div></section></div>;
}

function InstructorManager({ data }: { data: WorkspaceData }) {
  const instructors=data.users.filter((row)=>row.role==="instructor");
  return <section className="workspace-panel"><div className="panel-heading"><div><p>INSTRUCTOR CONTROL</p><h2>Instructors, courses, materials, and students</h2></div><span className="status-chip">{instructors.length} instructors</span></div>{instructors.length?<div className="instructor-grid">{instructors.map((instructor)=>{const courses=data.courses.filter((course)=>String(value(course,"instructorEmail","instructor_email")).toLowerCase()===String(instructor.email).toLowerCase());const ids=courses.map((course)=>Number(course.id));const enrollments=data.enrollments.filter((row)=>ids.includes(Number(row.course_id)));return <article className="instructor-card" key={String(instructor.email)}><header><span>{String(instructor.name||instructor.email).slice(0,2).toUpperCase()}</span><div><h3>{String(instructor.name)}</h3><p>{String(instructor.email)}</p></div></header><div className="instructor-numbers"><b>{courses.length}<small>Courses</small></b><b>{data.lessons.filter((lesson)=>ids.includes(Number(lesson.course_id))).length}<small>Materials</small></b><b>{new Set(enrollments.map((row)=>String(row.user_email))).size}<small>Students</small></b></div>{courses.map((course)=>{const students=enrollments.filter((row)=>Number(row.course_id)===Number(course.id));return <details key={String(course.id)}><summary><b>{String(value(course,"titleEn","title_en"))}</b><span>{students.length} students · {data.lessons.filter((lesson)=>Number(lesson.course_id)===Number(course.id)).length} materials</span></summary><div className="instructor-students">{students.map((enrollment)=>{const student=data.users.find((row)=>row.email===enrollment.user_email);return <p key={String(enrollment.user_email)}><b>{String(student?.name||enrollment.studentName||enrollment.user_email)}</b><span>{String(enrollment.user_email)} · {String(student?.phone||"No phone")} · {String(student?.specialty||"No specialty")}</span></p>;})}</div></details>;})}</article>;})}</div>:<EmptyState>Assign an instructor to a course to see their dashboard here.</EmptyState>}</section>;
}

function AccessCodeManager({ data, act }: { data: WorkspaceData; act:(action:string,data:Record<string,unknown>)=>Promise<boolean> }) {
  const [count,setCount]=useState(1);const [courseId,setCourseId]=useState(Number(data.courses[0]?.id||0));const [planType,setPlanType]=useState("full_curriculum");const [sectionType,setSectionType]=useState("full_curriculum");const [sectionLimit,setSectionLimit]=useState(1);const [availabilityDays,setAvailabilityDays]=useState(30);
  return <div className="manager-grid"><section className="workspace-panel form-panel"><div className="panel-heading"><div><p>PERSONAL ACCESS</p><h2>Generate course codes</h2></div></div><div className="control-form"><label>Course<select value={courseId} onChange={(e)=>setCourseId(Number(e.target.value))}><option value="0">Choose course</option>{data.courses.map((c)=><option key={String(c.id)} value={String(c.id)}>{String(value(c,"titleEn","title_en"))}</option>)}</select></label><label>Subscription plan<select value={planType} onChange={(e)=>{setPlanType(e.target.value);setSectionType(e.target.value);}}>{Object.entries(planLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Allowed section type<select value={sectionType} disabled={planType==="full_curriculum"} onChange={(e)=>setSectionType(e.target.value)}>{Object.entries(planLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Number of sections<input type="number" min="1" max="200" value={sectionLimit} onChange={(e)=>setSectionLimit(Number(e.target.value))}/></label><label>Availability (days)<input type="number" min="1" max="730" value={availabilityDays} onChange={(e)=>setAvailabilityDays(Number(e.target.value))}/></label><label>Number of codes<input type="number" min="1" max="300" value={count} onChange={(e)=>setCount(Number(e.target.value))}/></label><button className="workspace-primary" disabled={!courseId||count<1} onClick={()=>void act("generateAccessCode",{courseId,planType,sectionType,sectionLimit,availabilityDays,count})}>Generate unique codes <span>↗</span></button></div></section><section className="workspace-panel course-list-panel"><div className="panel-heading"><div><p>GENERATED CODES</p><h2>Student access register</h2></div><span className="status-chip">{data.accessCodes.length} codes</span></div>{data.accessCodes.length?<div className="access-code-list">{data.accessCodes.map((row)=><article key={String(row.id)}><code>{String(row.code)}</code><div><b>{String(row.studentName||row.student_email||"Unassigned")}</b><p>{String(row.courseTitle)} · {planLabels[String(row.plan_type)]||String(row.plan_type)}</p><small>{Number(row.section_limit)} sections · until {new Date(String(row.available_until)).toLocaleDateString()}</small></div><span className={`review-status ${String(row.status)}`}>{String(row.status)}</span>{row.status!=="revoked"&&<button className="danger-action" onClick={()=>void act("revokeAccessCode",{id:row.id})}>Revoke</button>}</article>)}</div>:<EmptyState>Generate the first codes for a course.</EmptyState>}</section></div>;
}

function ActivateCode({ accessCodes, act }: { accessCodes:AnyRow[]; act:(action:string,data:Record<string,unknown>)=>Promise<boolean> }) {
  const [code,setCode]=useState("");return <div className="workspace-stack"><section className="workspace-panel activate-card"><div className="panel-heading"><div><p>PERSONAL COURSE ACCESS</p><h2>Activate your subscription code</h2></div></div><p>Your code is personal and only works with your account.</p><div className="activate-row"><input value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} placeholder="4Z-XXXXXXXXXXXX"/><button className="workspace-primary" disabled={!code.trim()} onClick={()=>void act("redeemAccessCode",{code}).then((ok)=>ok&&setCode(""))}>Activate code <span>↗</span></button></div></section>{accessCodes.length?<section className="workspace-panel"><div className="access-code-list">{accessCodes.map((row)=><article key={String(row.id)}><div><b>{String(row.courseTitle)}</b><p>{planLabels[String(row.plan_type)]||String(row.plan_type)}</p><small>{Number(row.section_limit)} sections · until {new Date(String(row.available_until)).toLocaleDateString()}</small></div><span className={`review-status ${String(row.status)}`}>{String(row.status)}</span></article>)}</div></section>:null}</div>;
}

const blankCourse = { titleEn: "", titleAr: "", categoryEn: "", categoryAr: "", summaryEn: "", summaryAr: "", instructorName: "", instructorEmail: "", whatsapp: "", price: 0, mode: "Recorded", imageUrl: "/assets/course-tech.png", level: "All levels", duration: "" };

function CourseManager({ courses, saveCourse, manageCourse, saveSubjects, academic, role }: { courses: AnyRow[]; saveCourse: (course: Record<string, unknown>) => Promise<boolean>; manageCourse: (action: "publish" | "delete", course: Record<string, unknown>) => Promise<boolean>; saveSubjects: (courseId: number, subjectIds: number[]) => Promise<boolean>; academic: AcademicData; role: string }) {
  const [editing, setEditing] = useState<Record<string, unknown>>(blankCourse);
  return <div className="manager-grid">
    <section className="workspace-panel course-list-panel">
      <div className="panel-heading"><div><p>COURSE CATALOG</p><h2>{courses.length} editable spaces</h2></div><button className="outline-button" onClick={() => setEditing(blankCourse)}>+ New course</button></div>
      {courses.length ? <div className="dashboard-course-list">{courses.map((course) => <article key={String(course.id)}>
        <img src={String(value(course, "imageUrl", "image_url"))} alt="" />
        <div><small>{String(value(course, "categoryEn", "category_en"))} · {String(course.mode)}</small><h3>{String(value(course, "titleEn", "title_en"))}</h3><p>{String(value(course, "instructorName", "instructor_name"))}</p></div>
        <div className="row-actions">
          <button onClick={() => setEditing({ ...course, titleEn: value(course, "titleEn", "title_en"), titleAr: value(course, "titleAr", "title_ar"), categoryEn: value(course, "categoryEn", "category_en"), categoryAr: value(course, "categoryAr", "category_ar"), summaryEn: value(course, "summaryEn", "summary_en"), summaryAr: value(course, "summaryAr", "summary_ar"), instructorName: value(course, "instructorName", "instructor_name"), instructorEmail: value(course, "instructorEmail", "instructor_email"), imageUrl: value(course, "imageUrl", "image_url") })}>Edit</button>
          <button onClick={() => void manageCourse("publish", { id: course.id, published: !course.published })}>{course.published ? "Hide" : "Publish"}</button>
          <button className="danger-action" onClick={() => window.confirm("Delete this course and all related lessons, enrollments, payments, and messages?") && void manageCourse("delete", { id: course.id })}>Delete</button>
          <span className={course.published ? "published" : "draft"}>{course.published ? "Published" : "Draft"}</span>
        </div>
      </article>)}</div> : <EmptyState>No courses yet. Use the editor to create your first draft.</EmptyState>}
    </section>
    <section className="workspace-panel form-panel"><div className="panel-heading"><div><p>EDITOR</p><h2>{editing.id ? "Update course" : "Create course draft"}</h2></div></div><CourseForm data={editing} setData={setEditing} onSave={saveCourse} role={role} /></section>
    {editing.id ? <section className="workspace-panel form-panel"><div className="panel-heading"><div><p>SUBJECT LINKING</p><h2>Which subjects does this course satisfy?</h2></div></div><SubjectPicker key={String(editing.id)} courseId={Number(editing.id)} initialSubjectIds={(Array.isArray(editing.subjectIds) ? editing.subjectIds : []).map(Number)} academic={academic} onSave={saveSubjects} /></section> : null}
  </div>;
}

// A course is only locked to the subjects it is explicitly linked to here — this is
// what redeemAccessCode/enroll check against on the server (see course_subjects and
// subject_locks in db/schema.sql). Grouped by college > university > year > term so
// picking the right subject among many is still findable.
function SubjectPicker({ courseId, initialSubjectIds, academic, onSave }: { courseId: number; initialSubjectIds: number[]; academic: AcademicData; onSave: (courseId: number, subjectIds: number[]) => Promise<boolean> }) {
  const [selected, setSelected] = useState<number[]>(initialSubjectIds);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((row) => row !== id) : [...current, id]);
  if (!academic.colleges.length) return <EmptyState>Add colleges, universities, years, terms, and subjects from the Academic structure tab first.</EmptyState>;
  return <div className="control-form">
    <div className="subject-picker">{academic.colleges.map((college) => <details key={college.id}><summary>{college.nameEn}</summary>{academic.universities.filter((university) => university.collegeId === college.id).map((university) => <details key={university.id}><summary>{university.nameEn}</summary>{academic.years.filter((year) => year.universityId === university.id).map((year) => <details key={year.id}><summary>{year.nameEn}</summary>{academic.terms.filter((term) => term.yearId === year.id).map((term) => <div key={term.id} className="subject-term-group"><b>{term.nameEn}</b>{academic.subjects.filter((subject) => subject.termId === term.id).map((subject) => <label key={subject.id} className="subject-checkbox"><input type="checkbox" checked={selected.includes(subject.id)} onChange={() => toggle(subject.id)} />{subject.nameEn}</label>)}</div>)}</details>)}</details>)}</details>)}</div>
    <button className="workspace-primary" onClick={() => void onSave(courseId, selected)}>Save subjects <span>↗</span></button>
  </div>;
}

function ContentStudio({ courses, lessons, act }: { courses: AnyRow[]; lessons: AnyRow[]; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const [courseId, setCourseId] = useState(Number(courses[0]?.id || 0));
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("video");
  const [assetUrl, setAssetUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [sectionType, setSectionType] = useState("full_curriculum");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadInfo, setUploadInfo] = useState("");

  const selectedCourse = courses.find((course) => Number(course.id) === courseId);
  const selectedLessons = lessons.filter((lesson) => Number(lesson.course_id) === courseId);
  const secureAsset = assetUrl ? isSecureUrl(assetUrl) : false;
  const canPublish = Boolean(courseId && title.trim() && assetUrl && secureAsset && (kind !== "live" || duration.trim()));

  const chooseKind = (nextKind: string) => {
    setKind(nextKind);
    setAssetUrl("");
    setDuration("");
    setUploadInfo("");
    setUploadProgress(0);
  };

  const upload = async (file: File) => {
    if (!courseId) return;
    setUploading(true); setUploadProgress(0); setUploadInfo("");
    try {
      const payload = await uploadProtectedFile(file, courseId, setUploadProgress);
      setAssetUrl(String(payload.url || ""));
      setKind(file.type.startsWith("video/") ? "video" : "file");
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replaceAll("-", " "));
      setUploadInfo(`${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · ready`);
    } catch (caught) { window.alert(caught instanceof Error ? caught.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  if (!courses.length) {
    return <section className="workspace-panel"><div className="panel-heading"><div><p>CONTENT STUDIO</p><h2>Video, live, and files</h2></div></div><EmptyState>Create a course draft first. Then return here to upload a video, schedule a live session, or add a protected file.</EmptyState></section>;
  }

  return <div className="studio-grid">
    <section className="workspace-panel studio-create">
      <div className="panel-heading"><div><p>CONTENT STUDIO</p><h2>Add learning material</h2></div><span className="status-chip">Private until enrolled</span></div>
      <div className="studio-course"><label>Course<select value={courseId} onChange={(event) => { setCourseId(Number(event.target.value)); setAssetUrl(""); setUploadInfo(""); }}>{courses.map((course) => <option key={String(course.id)} value={String(course.id)}>{String(value(course, "titleEn", "title_en"))}</option>)}</select></label><p>{selectedCourse?.published ? "This course is public. Enrolled students will be notified." : "This course is still a draft. Its material remains hidden from students."}</p></div>
      <div className="format-picker" role="group" aria-label="Content type">
        <button className={kind === "video" ? "active" : ""} onClick={() => chooseKind("video")}><b>▶</b><span>Recorded video<small>Upload MP4/WebM or use a secure media URL</small></span></button>
        <button className={kind === "live" ? "active" : ""} onClick={() => chooseKind("live")}><b>●</b><span>Live session<small>Add a meeting link and clear schedule</small></span></button>
        <button className={kind === "file" ? "active" : ""} onClick={() => chooseKind("file")}><b>□</b><span>Protected file<small>PDFs and images open inside the course room</small></span></button>
      </div>
      <div className="control-form">
        <label>Lesson title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "live" ? "Weekly live Q&A" : "Introduction and roadmap"} /></label>
        <label>{kind === "live" ? "Date and time" : "Duration / label"}<input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder={kind === "live" ? "Thursday 19:30 Cairo time" : kind === "video" ? "08:24" : "PDF guide"} /></label>
        <label>Section / package<select value={sectionType} onChange={(event) => setSectionType(event.target.value)}>{Object.entries(planLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>{kind === "live" ? "Secure meeting URL" : "Secure media URL"}<input value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} placeholder={kind === "live" ? "https://meet.google.com/…" : "Upload below or paste an HTTPS URL"} /></label>
        {assetUrl && !secureAsset ? <p className="field-warning">Use an HTTPS link. Uploaded files are accepted automatically.</p> : null}
        {kind !== "live" ? <><label className={`file-input ${uploading ? "uploading" : ""}`}>{uploading ? `Uploading ${uploadProgress}%` : kind === "video" ? "Choose a video file" : "Choose a PDF or image"}<input disabled={uploading} type="file" accept={kind === "video" ? "video/*" : ".pdf,image/*"} onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />{uploading ? <span style={{ width: `${uploadProgress}%` }} /> : null}</label>{uploadInfo ? <p className="upload-info">✓ {uploadInfo}</p> : <p className="upload-help">The original file stays behind signed-in course access.</p>}</> : <p className="upload-help">Only paid, active students in this course can see the live-room link.</p>}
        <button disabled={uploading || !canPublish} className="workspace-primary" onClick={() => void act("addLesson", { courseId, title, kind, assetUrl, duration, sectionType }).then((ok) => { if (ok) { setTitle(""); setAssetUrl(""); setDuration(""); setUploadInfo(""); setUploadProgress(0); } })}>Add to course <span>↗</span></button>
      </div>
      {assetUrl && secureAsset ? <div className={`studio-preview ${kind}`}>{kind === "video" ? <video src={assetUrl} controls controlsList="nodownload noremoteplayback" disablePictureInPicture preload="metadata" /> : kind === "live" ? <><span>● LIVE PREVIEW</span><h3>{title || "Live session"}</h3><p>{duration || "Add the session time above"}</p><a href={assetUrl} target="_blank" rel="noreferrer">Test meeting link ↗</a></> : <><b>□</b><p>{title || "Protected file"}</p><small>The student will open this file inside the protected viewer.</small></>}</div> : null}
    </section>
    <section className="workspace-panel studio-library">
      <div className="panel-heading"><div><p>COURSE OUTLINE</p><h2>{String(value(selectedCourse || {}, "titleEn", "title_en"))}</h2></div><span className="status-chip">{selectedLessons.length} items</span></div>
      {selectedLessons.length ? <div className="mini-list">{selectedLessons.map((lesson) => <div key={String(lesson.id)}><span>{lesson.kind === "video" ? "▶" : lesson.kind === "live" ? "●" : "□"}</span><p><b>{String(lesson.title)}</b><small>{String(lesson.kind)} · {String(lesson.duration || "No duration")}</small></p><div className="row-actions"><button onClick={() => void act("moveLesson", { id: lesson.id, direction: "up" })}>↑</button><button onClick={() => void act("moveLesson", { id: lesson.id, direction: "down" })}>↓</button><button className="danger-action" onClick={() => window.confirm("Delete this material permanently?") && void act("deleteLesson", { id: lesson.id })}>Delete</button></div></div>)}</div> : <EmptyState>No material in this course yet. Add a test video or live session from the studio.</EmptyState>}
    </section>
  </div>;
}


function CourseForm({ data, setData, onSave, role }: { data: Record<string, unknown>; setData: (data: Record<string, unknown>) => void; onSave: (data: Record<string, unknown>) => Promise<boolean>; role: string }) {
  const field = (name: string, label: string, type = "text") => <label>{label}<input type={type} value={String(data[name] ?? "")} onChange={(event) => setData({ ...data, [name]: type === "number" ? Number(event.target.value) : event.target.value })} /></label>;
  return <form className="control-form two-column" onSubmit={(event) => { event.preventDefault(); void onSave(data); }}>
    {field("titleEn", "English title")}{field("titleAr", "Arabic title")}{field("categoryEn", "English category")}{field("categoryAr", "Arabic category")}<label className="wide">English description<textarea value={String(data.summaryEn ?? "")} onChange={(event) => setData({ ...data, summaryEn: event.target.value })} /></label><label className="wide">Arabic description<textarea dir="rtl" value={String(data.summaryAr ?? "")} onChange={(event) => setData({ ...data, summaryAr: event.target.value })} /></label>{field("instructorName", "Instructor name")}{role === "admin" && field("instructorEmail", "Instructor email", "email")}{field("whatsapp", "Course WhatsApp")}{field("price", "Price (EGP)", "number")}<label>Delivery<select value={String(data.mode ?? "Recorded")} onChange={(event) => setData({ ...data, mode: event.target.value })}><option>Recorded</option><option>Live</option><option>Recorded + Live</option></select></label>{field("duration", "Duration")}{field("level", "Level")} {field("imageUrl", "Cover URL")}
    <button className="workspace-primary wide" type="submit">Save course <span>↗</span></button>
  </form>;
}

function StudentManager({ users, enrollments, academic, role, act }: { users: AnyRow[]; enrollments: AnyRow[]; academic: AcademicData; role: string; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const students = users.filter((user) => user.role === "student");
  const placement = (student: AnyRow) => {
    const university = academic.universities.find((row) => row.id === Number(student.universityId));
    const year = academic.years.find((row) => row.id === Number(student.yearId));
    return university && year ? `${university.nameEn} · ${year.nameEn}` : "Academic placement not set";
  };
  return <section className="workspace-panel"><div className="panel-heading"><div><p>APPLICATION REVIEW</p><h2>Student profiles</h2></div><span className="status-chip">{students.filter((user) => user.status === "pending").length} pending</span></div>{students.length ? <div className="data-table student-table">{students.map((student) => <article key={String(student.email)}><div className="student-avatar">{String(student.name || student.email).slice(0, 2).toUpperCase()}</div><div><b>{String(student.name)}</b><small>{String(student.email)}</small></div><div><b>{String(student.phone || "No phone")}</b><small>{String(student.city || "City not added")} · {String(student.country || "Country not added")}</small></div><div><b>{placement(student)}</b><small>{enrollments.filter((row) => row.user_email === student.email).length} enrollments</small></div><span className={`review-status ${String(student.status)}`}>{String(student.status)}</span><div className="row-actions"><button onClick={() => void act("reviewUser", { email: student.email, status: "approved" })}>Approve</button><button onClick={() => void act("reviewUser", { email: student.email, status: "needs_changes" })}>Changes</button>{role === "admin" && <button onClick={() => void act("setRole", { email: student.email, role: "instructor" })}>Make instructor</button>}</div></article>)}</div> : <EmptyState>New student applications will appear here.</EmptyState>}</section>;
}

function PaymentManager({ payments, act }: { payments: AnyRow[]; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  return <section className="workspace-panel"><div className="panel-heading"><div><p>PAYMENT CONTROL</p><h2>Enrollment transactions</h2></div><span className="status-chip">Manual review</span></div>{payments.length ? <div className="data-table payment-table">{payments.map((payment) => <article key={String(payment.id)}><div><b>{String(payment.studentName || payment.user_email)}</b><small>{String(payment.user_email)}</small></div><div><b>{String(payment.courseTitle)}</b><small>{String(payment.method).replaceAll("_", " ")}</small></div><div><b>{Number(payment.amount).toLocaleString()} EGP</b><small>Ref: {String(payment.reference || "—")}</small></div><span className={`review-status ${String(payment.status)}`}>{String(payment.status)}</span><div className="row-actions">{payment.status === "pending" && <><button onClick={() => void act("reviewPayment", { id: payment.id, status: "paid" })}>Confirm</button><button onClick={() => void act("reviewPayment", { id: payment.id, status: "rejected" })}>Reject</button></>}</div></article>)}</div> : <EmptyState>Payment requests will appear here after enrollment.</EmptyState>}</section>;
}

function DeviceManager({ rows, act }: { rows: AnyRow[]; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  return <section className="workspace-panel"><div className="panel-heading"><div><p>TRUSTED DEVICE</p><h2>Device change requests</h2></div><span className="status-chip">One device per student</span></div>{rows.length ? <div className="data-table device-table">{rows.map((row) => <article key={String(row.id)}><div><b>{String(row.user_email)}</b><small>Requested {String(row.created_at)}</small></div><code>{String(row.requested_device_id).slice(0, 18)}…</code><button className="outline-button" onClick={() => void act("approveDevice", { id: row.id })}>Trust this device</button></article>)}</div> : <EmptyState>No device change requests are waiting.</EmptyState>}</section>;
}

// Manages the college > university > year > term > subject tree that course
// enrollment locking (subject_locks) and student placement are both built on.
// Deleting any row cascades to everything nested under it in the database.
function AcademicManager({ academic, act }: { academic: AcademicData; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const [collegeForm, setCollegeForm] = useState({ nameEn: "", nameAr: "" });
  const [universityForm, setUniversityForm] = useState({ collegeId: "", nameEn: "", nameAr: "" });
  const [yearForm, setYearForm] = useState({ universityId: "", yearNumber: "1", nameEn: "", nameAr: "" });
  const [termForm, setTermForm] = useState({ yearId: "", termNumber: "1", nameEn: "", nameAr: "" });
  const [subjectForm, setSubjectForm] = useState({ termId: "", nameEn: "", nameAr: "" });
  const collegeName = (id: number) => academic.colleges.find((row) => row.id === id)?.nameEn || "—";
  const universityName = (id: number) => academic.universities.find((row) => row.id === id)?.nameEn || "—";
  const yearName = (id: number) => academic.years.find((row) => row.id === id)?.nameEn || "—";
  const termName = (id: number) => academic.terms.find((row) => row.id === id)?.nameEn || "—";
  return <div className="manager-grid">
    <section className="workspace-panel form-panel">
      <div className="panel-heading"><div><p>ADD</p><h2>Build the academic tree</h2></div></div>
      <div className="control-form">
        <label>College — English name<input value={collegeForm.nameEn} onChange={(e) => setCollegeForm({ ...collegeForm, nameEn: e.target.value })} /></label>
        <label>College — Arabic name<input value={collegeForm.nameAr} onChange={(e) => setCollegeForm({ ...collegeForm, nameAr: e.target.value })} /></label>
        <button className="workspace-primary" disabled={!collegeForm.nameEn || !collegeForm.nameAr} onClick={() => void act("addCollege", collegeForm).then((ok) => ok && setCollegeForm({ nameEn: "", nameAr: "" }))}>Add college <span>↗</span></button>
      </div>
      <div className="control-form">
        <label>University — College<select value={universityForm.collegeId} onChange={(e) => setUniversityForm({ ...universityForm, collegeId: e.target.value })}><option value="">Choose college</option>{academic.colleges.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
        <label>University — English name<input value={universityForm.nameEn} onChange={(e) => setUniversityForm({ ...universityForm, nameEn: e.target.value })} /></label>
        <label>University — Arabic name<input value={universityForm.nameAr} onChange={(e) => setUniversityForm({ ...universityForm, nameAr: e.target.value })} /></label>
        <button className="workspace-primary" disabled={!universityForm.collegeId || !universityForm.nameEn || !universityForm.nameAr} onClick={() => void act("addUniversity", { ...universityForm, collegeId: Number(universityForm.collegeId) }).then((ok) => ok && setUniversityForm({ collegeId: "", nameEn: "", nameAr: "" }))}>Add university <span>↗</span></button>
      </div>
      <div className="control-form">
        <label>Year — University<select value={yearForm.universityId} onChange={(e) => setYearForm({ ...yearForm, universityId: e.target.value })}><option value="">Choose university</option>{academic.universities.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
        <label>Year number (1-8)<input type="number" min="1" max="8" value={yearForm.yearNumber} onChange={(e) => setYearForm({ ...yearForm, yearNumber: e.target.value })} /></label>
        <label>Year — English name<input value={yearForm.nameEn} onChange={(e) => setYearForm({ ...yearForm, nameEn: e.target.value })} placeholder="e.g. First year" /></label>
        <label>Year — Arabic name<input value={yearForm.nameAr} onChange={(e) => setYearForm({ ...yearForm, nameAr: e.target.value })} /></label>
        <button className="workspace-primary" disabled={!yearForm.universityId || !yearForm.nameEn || !yearForm.nameAr} onClick={() => void act("addYear", { ...yearForm, universityId: Number(yearForm.universityId), yearNumber: Number(yearForm.yearNumber) }).then((ok) => ok && setYearForm({ universityId: "", yearNumber: "1", nameEn: "", nameAr: "" }))}>Add year <span>↗</span></button>
      </div>
      <div className="control-form">
        <label>Term — Year<select value={termForm.yearId} onChange={(e) => setTermForm({ ...termForm, yearId: e.target.value })}><option value="">Choose year</option>{academic.years.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
        <label>Term number (1-4)<input type="number" min="1" max="4" value={termForm.termNumber} onChange={(e) => setTermForm({ ...termForm, termNumber: e.target.value })} /></label>
        <label>Term — English name<input value={termForm.nameEn} onChange={(e) => setTermForm({ ...termForm, nameEn: e.target.value })} placeholder="e.g. First term" /></label>
        <label>Term — Arabic name<input value={termForm.nameAr} onChange={(e) => setTermForm({ ...termForm, nameAr: e.target.value })} /></label>
        <button className="workspace-primary" disabled={!termForm.yearId || !termForm.nameEn || !termForm.nameAr} onClick={() => void act("addTerm", { ...termForm, yearId: Number(termForm.yearId), termNumber: Number(termForm.termNumber) }).then((ok) => ok && setTermForm({ yearId: "", termNumber: "1", nameEn: "", nameAr: "" }))}>Add term <span>↗</span></button>
      </div>
      <div className="control-form">
        <label>Subject — Term<select value={subjectForm.termId} onChange={(e) => setSubjectForm({ ...subjectForm, termId: e.target.value })}><option value="">Choose term</option>{academic.terms.map((row) => <option key={row.id} value={String(row.id)}>{yearName(row.yearId)} — {row.nameEn}</option>)}</select></label>
        <label>Subject — English name<input value={subjectForm.nameEn} onChange={(e) => setSubjectForm({ ...subjectForm, nameEn: e.target.value })} /></label>
        <label>Subject — Arabic name<input value={subjectForm.nameAr} onChange={(e) => setSubjectForm({ ...subjectForm, nameAr: e.target.value })} /></label>
        <button className="workspace-primary" disabled={!subjectForm.termId || !subjectForm.nameEn || !subjectForm.nameAr} onClick={() => void act("addSubject", { ...subjectForm, termId: Number(subjectForm.termId) }).then((ok) => ok && setSubjectForm({ termId: "", nameEn: "", nameAr: "" }))}>Add subject <span>↗</span></button>
      </div>
    </section>
    <section className="workspace-panel course-list-panel">
      <div className="panel-heading"><div><p>CURRENT TREE</p><h2>{academic.subjects.length} subjects</h2></div></div>
      <div className="data-table">{academic.colleges.map((college) => <article key={college.id}><div><b>{college.nameEn}</b><small>College</small></div><button className="danger-action" onClick={() => window.confirm(`Delete "${college.nameEn}" and everything under it (universities, years, terms, subjects, and any course links)?`) && void act("deleteCollege", { id: college.id })}>Delete</button></article>)}
        {academic.universities.map((university) => <article key={university.id}><div><b>{university.nameEn}</b><small>University of {collegeName(university.collegeId)}</small></div><button className="danger-action" onClick={() => window.confirm(`Delete "${university.nameEn}" and everything under it?`) && void act("deleteUniversity", { id: university.id })}>Delete</button></article>)}
        {academic.years.map((year) => <article key={year.id}><div><b>{year.nameEn}</b><small>Year of {universityName(year.universityId)}</small></div><button className="danger-action" onClick={() => window.confirm(`Delete "${year.nameEn}" and everything under it?`) && void act("deleteYear", { id: year.id })}>Delete</button></article>)}
        {academic.terms.map((term) => <article key={term.id}><div><b>{term.nameEn}</b><small>Term of {yearName(term.yearId)}</small></div><button className="danger-action" onClick={() => window.confirm(`Delete "${term.nameEn}" and every subject under it?`) && void act("deleteTerm", { id: term.id })}>Delete</button></article>)}
        {academic.subjects.map((subject) => <article key={subject.id}><div><b>{subject.nameEn}</b><small>Subject of {termName(subject.termId)}</small></div><button className="danger-action" onClick={() => window.confirm(`Delete "${subject.nameEn}"? Any course linked to it and any student lock on it will be removed too.`) && void act("deleteSubject", { id: subject.id })}>Delete</button></article>)}
        {!academic.colleges.length ? <EmptyState>Add your first college to start building the tree.</EmptyState> : null}
      </div>
    </section>
  </div>;
}

function OnboardingGate({ act, onAnswered }: { act: (action: string, data: Record<string, unknown>) => Promise<boolean>; onAnswered: (choice: "yes" | "no") => void }) {
  const [busy, setBusy] = useState(false);
  const answer = async (choice: "yes" | "no") => {
    setBusy(true);
    const ok = await act("onboarding", { choice });
    setBusy(false);
    if (ok) onAnswered(choice);
  };
  return <section className="workspace-panel onboarding-gate"><div className="panel-heading"><div><p>ONE QUICK QUESTION</p><h2>Are you already enrolled in a specific course?</h2></div></div><p>This helps us take you to the right place. You can always switch between activating a code and browsing courses later.</p><div className="two-auth-fields"><button className="workspace-primary" disabled={busy} onClick={() => void answer("yes")}>Yes, I have a code <span>↗</span></button><button className="outline-button" disabled={busy} onClick={() => void answer("no")}>No, show me the courses</button></div></section>;
}

function PendingProfile({ user, academic, act }: { user: PlatformUser; academic: AcademicData; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  return <div className="pending-layout"><section><p className="micro-label">APPLICATION STATUS</p><h2>{user.status === "needs_changes" ? "Your profile needs an update." : "Complete your student profile."}</h2><p>Course payment and enrollment become available after an administrator or instructor reviews your information.</p><ol><li className="done">Account created</li><li className={user.phone ? "done" : ""}>Full profile submitted</li><li>Academic review</li><li>Course enrollment</li></ol></section><ProfileForm user={user} academic={academic} act={act} /></div>;
}

const HIGH_SCHOOL_GRADES: { value: string; label: string }[] = [
  { value: "first_secondary", label: "First Secondary" },
  { value: "second_secondary", label: "Second Secondary" },
  { value: "third_secondary", label: "Third Secondary" },
];

function ProfileForm({ user, academic, act }: { user: PlatformUser; academic: AcademicData; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ name: user.name || "", phone: user.phone || "", whatsapp: user.whatsapp || "", country: user.country || "", city: user.city || "", specialty: user.specialty || "" });
  const [stage, setStage] = useState(user.stage || "");
  const [level, setLevel] = useState(user.level || "");
  const [collegeId, setCollegeId] = useState(user.collegeId ? String(user.collegeId) : "");
  const [universityId, setUniversityId] = useState(user.universityId ? String(user.universityId) : "");
  const [yearId, setYearId] = useState(user.yearId ? String(user.yearId) : "");
  const universities = academic.universities.filter((row) => String(row.collegeId) === collegeId);
  const years = academic.years.filter((row) => String(row.universityId) === universityId);
  const submit = (event: React.FormEvent) => { event.preventDefault(); void act("profile", { ...form, stage, level: stage === "high_school" ? level : "", collegeId: stage === "university" ? Number(collegeId) : null, universityId: stage === "university" ? Number(universityId) : null, yearId: stage === "university" ? Number(yearId) : null }); };
  return <section className="workspace-panel profile-form"><div className="panel-heading"><div><p>STUDENT DETAILS</p><h2>Clear, reviewable information</h2></div></div><form className="control-form two-column" onSubmit={submit}>{Object.entries({ name: "Full legal name", phone: "Phone number", whatsapp: "WhatsApp number", country: "Country", city: "City", specialty: "Field of study / work" }).map(([name, label]) => <label key={name}>{label}<input required={["name", "phone"].includes(name)} value={form[name as keyof typeof form]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} /></label>)}
    <label>Education stage<select required value={stage} onChange={(event) => { setStage(event.target.value); setCollegeId(""); setUniversityId(""); setYearId(""); setLevel(""); }}><option value="" disabled>Choose your stage</option><option value="high_school">High school</option><option value="university">University</option><option value="graduate">Graduate</option></select></label>
    {stage === "high_school" && <label>Grade<select required value={level} onChange={(event) => setLevel(event.target.value)}><option value="" disabled>Choose your grade</option>{HIGH_SCHOOL_GRADES.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label>}
    {stage === "university" && <>
      <label>College<select required value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setUniversityId(""); setYearId(""); }}><option value="" disabled>Choose your college</option>{academic.colleges.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
      <label>University<select required disabled={!collegeId} value={universityId} onChange={(event) => { setUniversityId(event.target.value); setYearId(""); }}><option value="" disabled>Choose your university</option>{universities.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
      <label>Year<select required disabled={!universityId} value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="" disabled>Choose your year</option>{years.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
    </>}
    <button className="workspace-primary wide" type="submit">Submit for review <span>↗</span></button></form></section>;
}

function Discover({ courses, demoPayments, act }: { courses: AnyRow[]; demoPayments: boolean; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const [paying, setPaying] = useState<number | null>(null);
  const [method, setMethod] = useState("cash_transfer");
  const [reference, setReference] = useState("");
  if (!courses.length) return <section className="workspace-panel"><div className="panel-heading"><div><p>COURSE CATALOG</p><h2>Discover 4Z Academy</h2></div></div><EmptyState>No courses are open for enrollment yet. Published courses will appear here automatically.</EmptyState></section>;
  return <div><div className="workspace-section-heading"><p>Choose a course and its instructor. Access opens only after payment is confirmed.</p></div><div className="workspace-course-grid">{courses.map((course) => {
    const whatsapp = String(course.whatsapp || "").replace(/\D/g, "");
    const canSubmit = method === "test_card" || Boolean(reference.trim());
    return <article key={String(course.id)}><img src={String(value(course, "imageUrl", "image_url"))} alt="" /><div><small>{String(value(course, "categoryEn", "category_en"))} · {String(course.mode)}</small><h2>{String(value(course, "titleEn", "title_en"))}</h2><p>with <b>{String(value(course, "instructorName", "instructor_name"))}</b></p><div className="course-price"><strong>{Number(course.price).toLocaleString()} EGP</strong>{whatsapp.length >= 8 ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">WhatsApp ↗</a> : null}</div>{course.paymentStatus === "paid" ? <span className="enrolled-chip">Enrolled</span> : paying === Number(course.id) ? <div className="payment-box"><select value={method} onChange={(event) => { setMethod(event.target.value); setReference(""); }}>{demoPayments ? <option value="test_card">Test card — local testing only</option> : null}<option value="visa">Visa / card — pending review</option><option value="wallet">Orange Cash / wallet</option><option value="cash_transfer">Cash transfer</option></select>{method !== "test_card" && <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Payment reference (required)" />}<button disabled={!canSubmit} onClick={() => void act("enroll", { courseId: course.id, method, reference }).then((ok) => { if (ok) { setPaying(null); setReference(""); } })}>Submit payment request</button></div> : <button className="workspace-primary" onClick={() => setPaying(Number(course.id))}>Enroll & pay <span>↗</span></button>}</div></article>;
  })}</div></div>;
}

function MyLearning({ data }: { data: WorkspaceData }) {
  const active = data.courses.filter((course) => course.paymentStatus === "paid" && course.enrollmentStatus === "active");
  const [selected, setSelected] = useState<number | null>(active[0] ? Number(active[0].id) : null);
  const chosen = active.find((course) => Number(course.id) === selected);
  const lessons = data.lessons.filter((lesson) => Number(lesson.course_id) === selected);
  const [lessonId, setLessonId] = useState<number | null>(null);
  const opened = lessons.find((lesson) => Number(lesson.id) === lessonId) || lessons[0];
  const source = String(opened?.asset_url || "");
  const asset = data.mediaAssets.find((row) => String(row.url) === source);
  const inferredMime = String(asset?.mimeType || (source.match(/\.pdf(?:$|\?)/i) ? "application/pdf" : source.match(/\.(png|jpe?g|gif|webp)(?:$|\?)/i) ? "image/*" : opened?.kind === "video" ? "video/*" : ""));
  return active.length ? <div className="learning-layout"><aside>{active.map((course) => <button key={String(course.id)} className={selected === Number(course.id) ? "active" : ""} onClick={() => { setSelected(Number(course.id)); setLessonId(null); }}><img src={String(value(course, "imageUrl", "image_url"))} alt="" /><span><b>{String(value(course, "titleEn", "title_en"))}</b><small>{Number(course.progress || 0)}% complete</small></span></button>)}</aside><section>{chosen && <><p className="micro-label">PROTECTED COURSE ROOM</p><h2>{String(value(chosen, "titleEn", "title_en"))}</h2><LearningViewer lesson={opened} source={source} mimeType={inferredMime} name={data.user.name} email={data.user.email} /><div className="lesson-list">{lessons.map((lesson, index) => <article className={Number(opened?.id) === Number(lesson.id) ? "active" : ""} key={String(lesson.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{String(lesson.title)}</b><small>{String(lesson.kind)} · {String(lesson.duration || "View in platform")}</small></div>{lesson.asset_url ? <button onClick={() => setLessonId(Number(lesson.id))}>{lesson.kind === "file" ? "Open" : lesson.kind === "live" ? "Details" : "Play"}</button> : <button disabled>Coming soon</button>}</article>)}</div></>}</section></div> : <EmptyState>Your paid courses will appear here. Open Discover to choose your first course.</EmptyState>;
}

function LearningViewer({ lesson, source, mimeType, name, email }: { lesson?: AnyRow; source: string; mimeType: string; name: string; email: string }) {
  if (!lesson) return <ProtectedPlayer name={name} email={email} compact />;
  if (lesson.kind === "live") return <section className="live-room-card"><span>● LIVE SESSION</span><h3>{String(lesson.title)}</h3><p>{String(lesson.duration || "The instructor will share the schedule here.")}</p>{source ? <a href={source} target="_blank" rel="noreferrer">Join live room ↗</a> : <button disabled>Meeting link coming soon</button>}</section>;
  if (lesson.kind === "file") return <ProtectedDocument source={source} mimeType={mimeType} title={String(lesson.title)} name={name} email={email} />;
  return <ProtectedPlayer name={name} email={email} compact source={source} title={String(lesson.title)} />;
}

function ProtectedDocument({ source, mimeType, title, name, email }: { source: string; mimeType: string; title: string; name: string; email: string }) {
  const stamp = useMemo(() => `${name} · ${email.replace(/(.{2}).+(@.+)/, "$1***$2")}`, [name, email]);
  if (!source) return <div className="document-empty">This file will be available soon.</div>;
  return <section className="document-viewer" onContextMenu={(event) => event.preventDefault()}><header><b>{title}</b><span>VIEW ONLY</span></header><div>{mimeType.startsWith("image/") ? <img src={source} alt={title} draggable={false} /> : <iframe src={`${source}#toolbar=0&navpanes=0`} title={title} />}<span className="moving-watermark">{stamp}</span></div></section>;
}

function ProtectedPlayer({ name, email, compact = false, source = "", title = "Protected course preview" }: { name: string; email: string; compact?: boolean; source?: string; title?: string }) {
  const stamp = useMemo(() => `${name} · ${email.replace(/(.{2}).+(@.+)/, "$1***$2")}`, [name, email]);
  return <section className={`player-demo ${compact ? "compact" : ""}`} onContextMenu={(event) => event.preventDefault()}><div className="player-screen">{source ? <video src={source} title={title} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata" /> : <><img src="/assets/course-tech.png" alt={title} draggable={false} /><button className="play-button" aria-label="Preview only">▶</button><div className="player-controls"><span>PREVIEW</span><i><b /></i><span>Original</span></div></>}<div className="player-shade" /><span className="brand-watermark">4Z ACADEMY · VIEW ONLY</span><span className="moving-watermark">{stamp}</span></div>{!compact && <div className="player-notes"><article><b>Dynamic identity</b><p>The signed-in student’s masked identity moves across each recorded lesson.</p></article><article><b>Private original file</b><p>Direct uploads play at their original quality. Adaptive 360p–1080p needs a streaming provider later.</p></article><article><b>Practical deterrence</b><p>Authorized playback, no download control, and a visible identity watermark reduce misuse.</p></article></div>}</section>;
}

function Notifications({ rows, act }: { rows: AnyRow[]; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const unread = rows.filter((row) => !row.read).length;
  return <section className="workspace-panel"><div className="panel-heading"><div><p>COURSE-SCOPED UPDATES</p><h2>Your notifications</h2></div>{unread ? <button className="outline-button" onClick={() => void act("markNotificationsRead", {})}>Mark all read ({unread})</button> : <span className="status-chip">All read</span>}</div>{rows.length ? <div className="notification-list">{rows.map((row) => <article className={row.read ? "" : "unread"} key={String(row.id)}><i /><div><small>{String(row.courseTitle || "Platform")}</small><b>{String(row.title)}</b><p>{String(row.message)}</p><time>{String(row.created_at)}</time></div>{!row.read ? <button onClick={() => void act("markNotificationRead", { id: row.id })}>Mark read</button> : null}</article>)}</div> : <EmptyState>New material, replies, and course updates will appear here.</EmptyState>}</section>;
}

function Messages({ data, act }: { data: WorkspaceData; act: (action: string, data: Record<string, unknown>) => Promise<boolean> }) {
  const student = data.user.role === "student";
  const eligible = useMemo(() => student ? data.courses.filter((course) => course.paymentStatus === "paid" && course.enrollmentStatus === "active") : data.courses, [data.courses, student]);
  const [courseId, setCourseId] = useState(Number(eligible[0]?.id || 0));
  const selected = eligible.find((course) => Number(course.id) === courseId);
  const recipients = student ? [] : data.enrollments.filter((row) => Number(row.course_id) === courseId && row.payment_status === "paid" && row.status === "active");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const effectiveRecipient = student ? String(value(selected || {}, "instructorEmail", "instructor_email")) : recipient;
  const thread = data.messages.filter((message) => Number(message.course_id) === courseId);
  if (!eligible.length) return <section className="workspace-panel"><div className="panel-heading"><div><p>COURSE CONVERSATIONS</p><h2>Messages</h2></div></div><EmptyState>{student ? "Messages become available after a paid course enrollment is active." : "Create a course and enroll a student before starting course messages."}</EmptyState></section>;
  return <div className="message-layout"><section className="workspace-panel"><div className="panel-heading"><div><p>COURSE CONVERSATIONS</p><h2>{String(value(selected || {}, "titleEn", "title_en") || "Direct messages")}</h2></div><span className="status-chip">{thread.length} messages</span></div>{thread.length ? <div className="message-list">{thread.map((message) => <article key={String(message.id)} className={message.sender_email === data.user.email ? "mine" : ""}><small>{String(message.senderName || message.sender_email)} → {String(message.receiverName || message.receiver_email)}</small><p>{String(message.body)}</p><time>{String(message.created_at)}</time></article>)}</div> : <EmptyState>No messages in this course yet. Start the conversation from the form.</EmptyState>}</section><section className="workspace-panel compose-panel"><div className="panel-heading"><div><p>NEW MESSAGE</p><h2>Ask in context</h2></div></div><div className="control-form"><label>Course<select value={courseId} onChange={(event) => { setCourseId(Number(event.target.value)); setRecipient(""); }}>{eligible.map((course) => <option key={String(course.id)} value={String(course.id)}>{String(value(course, "titleEn", "title_en"))}</option>)}</select></label>{!student && <label>Active student<select value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">Choose a student</option>{recipients.map((row) => <option key={String(row.user_email)} value={String(row.user_email)}>{String(row.studentName || row.user_email)}</option>)}</select></label>} {student ? <p className="message-recipient">To: {String(value(selected || {}, "instructorName", "instructor_name"))}</p> : null}<label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your course-specific message…" /></label><button disabled={!courseId || !effectiveRecipient || !body.trim()} className="workspace-primary" onClick={() => void act("sendMessage", { courseId, receiverEmail: effectiveRecipient, body }).then((ok) => ok && setBody(""))}>Send message <span>↗</span></button></div></section></div>;
}