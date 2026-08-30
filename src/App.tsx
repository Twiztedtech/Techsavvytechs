/**
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router";
import { useEffect, lazy, Suspense } from "react";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import Home from "./pages/Home";
import LowVoltage from "./pages/LowVoltage";
import Infrastructure from "./pages/Infrastructure";
import MSP from "./pages/MSP";
import CellBoosting from "./pages/CellBoosting";
import About from "./pages/About";
import ServiceAreas from "./pages/ServiceAreas";
import Portal from "./pages/Portal";
import Auth from "./pages/Auth";
import Contact from "./pages/Contact";
import { Seo } from "./components/Seo";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";

const ContractorDashboard = lazy(() => import("./pages/ContractorDashboard"));
const ContractorOnboarding = lazy(() => import("./pages/ContractorOnboarding"));
const CRM = lazy(() => import("./pages/CRM"));
const CustomerDocument = lazy(() => import("./pages/CustomerDocument"));

// Scroll to top helper
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const isContractorPortal = pathname.startsWith("/contractor");
  const isSecureCustomerDocument = pathname === "/customer/document";

  return (
    <>
      <ScrollToTop />
      <Seo />
      <div className="min-h-screen flex flex-col selection:bg-safety-orange selection:text-white bg-brand-black text-brand-white">
        {/* Blueprint Grid Overlay */}
        <div className="fixed inset-0 blueprint-grid pointer-events-none z-0 opacity-40" />

        {!isContractorPortal && !isSecureCustomerDocument && <Navbar />}

        <main className="flex-grow relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services/low-voltage" element={<LowVoltage />} />
            <Route
              path="/services/infrastructure"
              element={<Infrastructure />}
            />
            <Route path="/services/msp" element={<MSP />} />
            <Route path="/services/cell-boosting" element={<CellBoosting />} />
            <Route path="/about/mission" element={<About />} />
            <Route path="/about/service-areas" element={<ServiceAreas />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/crm"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-[60vh] grid place-items-center text-sm text-slate-400">
                      Loading CRM command center…
                    </div>
                  }
                >
                  <CRM />
                </Suspense>
              }
            />
            <Route
              path="/customer/document"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-[60vh] grid place-items-center text-sm text-slate-400">
                      Loading secure document…
                    </div>
                  }
                >
                  <CustomerDocument />
                </Suspense>
              }
            />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route
              path="/contractor/dashboard"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-screen grid place-items-center text-sm text-slate-400">
                      Loading secure portal…
                    </div>
                  }
                >
                  <ContractorDashboard />
                </Suspense>
              }
            />
            <Route
              path="/contractor/onboarding"
              element={
                <Suspense
                  fallback={
                    <div className="min-h-screen grid place-items-center text-sm text-slate-400">
                      Loading secure portal…
                    </div>
                  }
                >
                  <ContractorOnboarding />
                </Suspense>
              }
            />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            {/* Fallback to Home */}
            <Route path="*" element={<Home />} />
          </Routes>
        </main>

        {!isContractorPortal && !isSecureCustomerDocument && <Footer />}
      </div>
    </>
  );
}
