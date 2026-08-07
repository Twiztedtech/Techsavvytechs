import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router';
import { DashboardHeader } from '../features/contractor/layout/DashboardHeader';
import { ContractorOnboardingCard, type OnboardingState } from '../features/contractor/onboarding/ContractorOnboardingCard';
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function ContractorOnboarding() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setIsAuthenticated(false);
      setLoginEmail('');
      navigate('/portal');
      return;
    }
    setLoginEmail(user.email || '');
    setIsAuthenticated(true);
  }), [navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const loadOnboarding = async () => {
      try {
        setLoading(true);
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/portal/onboarding', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load onboarding status.');
        if (!cancelled) setOnboarding(data.onboarding as OnboardingState);
      } catch (error) {
        console.error('Could not load contractor onboarding:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadOnboarding();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center text-sm font-mono">
        Loading secure onboarding portal…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-x-hidden">
      <DashboardHeader
        role="contractor"
        canAccessAdmin={false}
        onRoleChange={() => {}}
        onContactAdmin={() => {}}
        onSignOut={() => void signOut(auth)}
      />

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/contractor/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        <div className="max-w-4xl mx-auto">
          {onboarding?.status === 'approved' ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
              <h2 className="text-2xl font-black text-white">Onboarding Approved</h2>
              <p className="text-sm text-slate-350 max-w-md mx-auto">
                Thank you! Your W-9 tax documentation and agreement acknowledgement have been successfully verified and are on file.
              </p>
              <div className="pt-4">
                <Link
                  to="/contractor/dashboard"
                  className="inline-flex items-center justify-center bg-green-500 hover:bg-green-400 text-slate-950 font-bold px-6 py-3 rounded-xl text-xs transition"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <ContractorOnboardingCard
              onboarding={onboarding}
              onUpdated={(updated) => {
                setOnboarding(updated);
                if (updated.status === 'submitted') {
                  alert('W-9 submitted successfully! We are reviewing your W-9.');
                }
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
