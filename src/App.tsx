/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
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
      <ScrollToTop />
      <div className="min-h-screen flex flex-col selection:bg-safety-orange selection:text-white bg-brand-black text-brand-white">
        {/* Blueprint Grid Overlay */}
        <div className="fixed inset-0 blueprint-grid pointer-events-none z-0 opacity-40" />

        <Navbar />

        <main className="flex-grow relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services/low-voltage" element={<LowVoltage />} />
            <Route path="/services/infrastructure" element={<Infrastructure />} />
            <Route path="/services/msp" element={<MSP />} />
            <Route path="/services/cell-boosting" element={<CellBoosting />} />
            <Route path="/about/mission" element={<About />} />
            <Route path="/about/service-areas" element={<ServiceAreas />} />
            <Route path="/portal" element={<Portal />} />
            <Route path="/auth" element={<Auth />} />
            {/* Fallback to Home */}
            <Route path="*" element={<Home />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </Router>
  );
}
