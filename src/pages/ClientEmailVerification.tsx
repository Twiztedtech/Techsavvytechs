import { useEffect, useState } from "react";
import { applyActionCode, checkActionCode } from "firebase/auth";
import { CheckCircle2, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { auth } from "../lib/firebase";

type VerificationState = "checking" | "ready" | "submitting" | "success" | "invalid";

export default function ClientEmailVerification() {
  const code = new URLSearchParams(window.location.search).get("oobCode") || "";
  const [state, setState] = useState<VerificationState>(code ? "checking" : "invalid");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void checkActionCode(auth, code)
      .then((info) => {
        if (cancelled) return;
        setEmail(info.data.email || "");
        setState("ready");
      })
      .catch(async () => {
        if (cancelled) return;
        if (auth.currentUser) {
          await auth.currentUser.reload().catch(() => undefined);
          if (auth.currentUser.emailVerified) {
            setState("success");
            return;
          }
        }
        setState("invalid");
      });
    return () => { cancelled = true; };
  }, [code]);

  const confirm = async () => {
    setState("submitting");
    try {
      await applyActionCode(auth, code);
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
      }
      setState("success");
    } catch {
      if (auth.currentUser) {
        await auth.currentUser.reload().catch(() => undefined);
        if (auth.currentUser.emailVerified) {
          setState("success");
          return;
        }
      }
      setState("invalid");
    }
  };

  return (
    <div className="min-h-screen px-6 py-20">
      <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center">
        <section className="glass-card w-full border-t-4 border-tech-green p-8 text-center">
          {state === "success" ? <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-tech-green" /> : state === "invalid" ? <TriangleAlert className="mx-auto mb-4 h-14 w-14 text-amber-400" /> : <ShieldCheck className="mx-auto mb-4 h-14 w-14 text-tech-green" />}

          {state === "checking" && <><h1 className="text-2xl font-bold text-white">Checking your link…</h1><p className="mt-3 text-sm text-slate-400">This does not verify the address until you confirm below.</p></>}

          {(state === "ready" || state === "submitting") && <><p className="font-mono text-[10px] uppercase tracking-[0.3em] text-tech-green">TechSavvy Client Portal</p><h1 className="mt-3 text-3xl font-bold text-white">Confirm your email</h1><p className="mt-3 text-sm text-slate-400">{email ? `Verify ${email} to continue setting up your company access.` : "Verify your email to continue setting up your company access."}</p><button type="button" disabled={state === "submitting"} onClick={() => void confirm()} className="mt-7 w-full bg-tech-green px-5 py-3 font-bold text-brand-black disabled:opacity-60">{state === "submitting" ? "Verifying…" : "Confirm email address"}</button></>}

          {state === "success" && <><h1 className="text-3xl font-bold text-white">Email verified</h1><p className="mt-3 text-sm text-slate-400">Your email is confirmed. Continue to the portal to finish company access.</p><Link to="/client" className="mt-7 inline-block w-full bg-tech-green px-5 py-3 font-bold text-brand-black">Continue to client portal</Link></>}

          {state === "invalid" && <><h1 className="text-3xl font-bold text-white">This link has already been used or expired</h1><p className="mt-3 text-sm text-slate-400">Your email may already be verified. Sign in to continue. If it is not verified, request one new email and use only the newest link.</p><Link to="/client" className="mt-7 inline-block w-full bg-tech-green px-5 py-3 font-bold text-brand-black">Sign in to client portal</Link></>}
        </section>
      </div>
    </div>
  );
}
