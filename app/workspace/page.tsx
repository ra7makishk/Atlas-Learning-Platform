import Link from "next/link";
import { currentUser } from "../../lib/auth";
import WorkspaceClient from "./workspace-client";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await currentUser();
  if (!user) {
    return <main className="auth-screen"><section className="auth-card"><Link className="academy-brand" href="/" aria-label="4Z Academy home"><img src="/assets/4z-academy-logo.png" alt="4Z Academy" /></Link><p className="micro-label">SECURE LEARNING PORTAL</p><h1>Continue to your learning workspace.</h1><p>Students, instructors, and administrators use the same secure portal with role-specific access.</p><div className="auth-buttons"><Link className="workspace-primary" href="/login">Student sign in <span>↗</span></Link><Link className="workspace-quiet" href="/register">Create a student account</Link></div><div className="auth-buttons"><Link className="workspace-primary" href="/instructor/login">Instructor sign in <span>↗</span></Link><Link className="workspace-quiet" href="/instructor/register">Create an instructor account</Link></div></section></main>;
  }
  return <WorkspaceClient initialUser={user} signOutHref="/api/auth/logout" />;
}
