"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register" | "forgot" | "reset";
type AcademicRow = { id: number; nameEn: string };
type Academic = { colleges: AcademicRow[]; universities: (AcademicRow & { collegeId: number })[]; years: (AcademicRow & { universityId: number; yearNumber: number })[] };

export default function AuthForm({ mode, token = "" }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [academic, setAcademic] = useState<Academic>({ colleges: [], universities: [], years: [] });
  const [collegeId, setCollegeId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [yearId, setYearId] = useState("");

  useEffect(() => {
    if (mode !== "register") return;
    fetch("/api/academic").then((response) => response.json()).then((payload: Academic) => setAcademic(payload)).catch(() => undefined);
  }, [mode]);

  const universities = academic.universities.filter((row) => String(row.collegeId) === collegeId);
  const years = academic.years.filter((row) => String(row.universityId) === universityId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form.entries());
    if (mode === "reset") data.token = token;
    const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : mode === "forgot" ? "/api/auth/password/request" : "/api/auth/password/reset";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const payload = await response.json() as { error?: string; message?: string; developmentResetUrl?: string; redirect?: string };
      if (!response.ok) throw new Error(payload.error || "The request could not be completed");
      if (mode === "login" || mode === "register") { router.push(payload.redirect || "/workspace"); router.refresh(); return; }
      if (mode === "reset") { setMessage("Password updated. You can now sign in."); return; }
      setMessage(payload.message || "Reset instructions are ready."); setResetUrl(payload.developmentResetUrl || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed"); }
    finally { setBusy(false); }
  }

  const title = mode === "login" ? "Welcome back." : mode === "register" ? "Create your student profile." : mode === "forgot" ? "Reset your password." : "Choose a new password.";
  return <main className="auth-screen"><section className="auth-card auth-form-card"><Link className="academy-brand" href="/" aria-label="4Z Academy home"><img src="/assets/4z-academy-logo.png" alt="4Z Academy" /></Link><p className="micro-label">4Z ACADEMY</p><h1>{title}</h1><form className="control-form" onSubmit={submit}>
    {mode === "register" && <><label>Full name<input name="name" required autoComplete="name" /></label><label>Phone number<input name="phone" required autoComplete="tel" /></label><div className="two-auth-fields"><label>WhatsApp<input name="whatsapp" autoComplete="tel" /></label><label>Country<input name="country" autoComplete="country-name" /></label></div><div className="two-auth-fields"><label>City<input name="city" /></label><label>Field of study / work<input name="specialty" /></label></div>
      <label>College<select name="collegeId" required value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setUniversityId(""); setYearId(""); }}><option value="" disabled>Choose your college</option>{academic.colleges.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
      <label>University<select name="universityId" required disabled={!collegeId} value={universityId} onChange={(event) => { setUniversityId(event.target.value); setYearId(""); }}><option value="" disabled>Choose your university</option>{universities.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
      <label>Year<select name="yearId" required disabled={!universityId} value={yearId} onChange={(event) => setYearId(event.target.value)}><option value="" disabled>Choose your year</option>{years.map((row) => <option key={row.id} value={String(row.id)}>{row.nameEn}</option>)}</select></label>
    </>}
    {mode !== "reset" && <label>Email address<input name="email" required type="email" autoComplete="email" /></label>}
    {!["forgot"].includes(mode) && <label>{mode === "reset" ? "New password" : "Password"}<input name="password" required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
    {mode === "login" && <label className="remember-me-field"><input name="rememberMe" type="checkbox" defaultChecked /> Remember me</label>}
    {error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}{resetUrl && <a className="dev-reset-link" href={resetUrl}>Open development reset link</a>}
    <button className="workspace-primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Request reset" : "Update password"}<span>↗</span></button>
  </form><div className="auth-switch">{mode === "login" && <><Link href="/forgot-password">Forgot password?</Link><Link href="/register">Create account</Link></>}{mode === "register" && <Link href="/login">Already registered? Sign in</Link>}{mode === "reset" && <Link href="/login">Return to sign in</Link>}</div></section></main>;
}