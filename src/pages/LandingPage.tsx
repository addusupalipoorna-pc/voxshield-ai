import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Mic,
  Activity,
  Lock,
  Smartphone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Server,
  Terminal,
  ArrowRight,
  Fingerprint,
  Radio,
  Cpu,
  Layers,
  ChevronRight
} from 'lucide-react';
import ThreeShield from '../components/ThreeShield';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-white text-slate-900 min-h-screen font-sans selection:bg-blue-100 selection:text-[#0B3B82]">
      {/* ───────────────────────────────────────────────────────────────────────
          HERO SECTION
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 border-b border-slate-200">
        {/* Subtle background ambient radial light */}
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-50/60 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-20 right-10 w-[400px] h-[400px] bg-cyan-50/40 rounded-full blur-2xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Messaging & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200/80 rounded-full">
                <span className="w-2 h-2 rounded-full bg-[#0B3B82] inline-block" />
                <span className="text-xs font-bold text-[#0B3B82] tracking-wider uppercase">
                  SIH26104 · IDENTITY VERIFICATION &amp; PROTECTION
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="text-5xl sm:text-6xl lg:text-[70px] font-extrabold text-slate-900 leading-[1.02] tracking-tight">
                CAN YOU TRUST <br />
                <span className="text-[#155EAD]">THE VOICE</span> <br />
                ON THE OTHER SIDE?
              </h1>

              {/* Description */}
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                AI-powered real-time protection against voice cloning and impersonation attacks.
                VoxShield verifies speaker identity, detects synthetic and replayed voices, analyzes
                command intent, and protects sensitive actions.
              </p>

              {/* Call to Actions */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/voice-analyzer"
                  className="px-7 py-3.5 bg-[#0B3B82] hover:bg-[#082F6B] text-white text-sm font-bold rounded-lg shadow-sm hover:shadow transition-all duration-150 flex items-center gap-2"
                >
                  <span>START VOICE ANALYSIS</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/attack-simulator"
                  className="px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-lg border border-slate-300 transition-all duration-150 shadow-sm"
                >
                  ATTACK SIMULATOR
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Real-time analysis</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Multi-layer verification</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  <span>Trusted device execution</span>
                </div>
              </div>
            </div>

            {/* Right Column: 3D Visualization & Security Status Cards */}
            <div className="lg:col-span-5 relative flex flex-col items-center">
              {/* 3D Crest Shield Container */}
              <div className="relative w-full max-w-[420px] aspect-square flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/50 to-transparent rounded-3xl border border-slate-200/80 -z-10 shadow-sm" />
                <ThreeShield size={340} status="active" />
              </div>

              {/* Enterprise Security Status Cards Grid */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-[420px] mt-4">
                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Authenticity
                    </span>
                    <span className="text-xs font-bold text-slate-900">VERIFIED</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Speaker Match
                    </span>
                    <span className="text-xs font-bold text-slate-900">IDENTIFIED</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Replay Defense
                    </span>
                    <span className="text-xs font-bold text-slate-900">CLEAR</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Bound Laptop
                    </span>
                    <span className="text-xs font-bold text-slate-900">TRUSTED</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          HERO BOTTOM BANNER
      ─────────────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 border-b border-slate-200 py-6 text-center">
        <p className="text-xs font-bold tracking-widest text-[#0B3B82] uppercase">
          SECURITY THAT LISTENS BEFORE IT ACTS · MULTI-FACTOR VOICE ZERO TRUST
        </p>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          PROBLEM SECTION
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="the-problem" className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-bold text-[#0B3B82] uppercase tracking-wider block mb-2">
              The Threat Landscape
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Voice authentication is under active attack.
            </h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              Generative voice clones, acoustic replay recorders, and compromised voice channels can
              bypass legacy PINs and single-layer biometric security.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1 */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Voice Cloning (Deepfakes)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Neural synthesis models can replicate target vocal pitch and timbre from only 3 seconds
                of public audio, spoofing voice-activated devices.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Replay Attacks</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Adversaries play back pre-recorded genuine voice commands using high-fidelity speakers
                to execute unauthorized actions without live presence.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-[#0B3B82] flex items-center justify-center mb-4">
                <Fingerprint className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Speaker Impersonation</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Background actors and unauthorized individuals mimic command syntax in corporate or
                sensitive smart environments without speaker identity checks.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center mb-4">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Unauthorized Commands</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Critical commands such as funds transfers or file deletion require hardware-bound
                confirmation and step-up OTP authentication before execution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          HOW IT WORKS SECTION
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mb-14">
            <span className="text-xs font-bold text-[#0B3B82] uppercase tracking-wider block mb-2">
              Verification Pipeline
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Six layers of deterministic validation.
            </h2>
            <p className="text-sm text-slate-600 mt-3">
              Every voice command passes through real-time spectral, biometric, and cryptographic
              inspection before touching your system.
            </p>
          </div>

          {/* Horizontal Process Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { num: '01', title: 'VOICE', desc: 'Real-time audio stream ingested from registered microphone.' },
              { num: '02', title: 'ANALYZE', desc: 'Extract MFCC, pitch, spectral rolloff, and zero-crossing.' },
              { num: '03', title: 'VERIFY', desc: 'Cosine similarity against 1:N enrolled speaker biometric vectors.' },
              { num: '04', title: 'ASSESS', desc: 'Detect replay artifacts and synthetic neural signatures.' },
              { num: '05', title: 'AUTHORIZE', desc: 'Command intent risk engine checks permissions and OTP policy.' },
              { num: '06', title: 'PROTECT', desc: 'Bound laptop agent revalidates token and requires CONTINUE.' },
            ].map((step, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 relative shadow-sm">
                <div className="text-xs font-extrabold text-[#0B3B82] mb-3">{step.num}</div>
                <h4 className="text-sm font-bold text-slate-900 mb-1.5">{step.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          SECURITY ARCHITECTURE SECTION
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="security" className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mb-14">
            <span className="text-xs font-bold text-[#0B3B82] uppercase tracking-wider block mb-2">
              Architecture
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              End-to-End Enterprise Defense Topology
            </h2>
            <p className="text-sm text-slate-600 mt-3">
              Strict separation between the analysis engine, authorization plane, and hardware execution agent.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Mic className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Voice Input</span>
                <span className="text-[11px] text-slate-500">Acoustic Audio</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Activity className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Feature Extraction</span>
                <span className="text-[11px] text-slate-500">MFCC &amp; FFT</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Fingerprint className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Speaker 1:N ID</span>
                <span className="text-[11px] text-slate-500">Biometric Match</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Shield className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Deepfake &amp; Replay</span>
                <span className="text-[11px] text-slate-500">Anti-Spoofing</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Server className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Risk Engine</span>
                <span className="text-[11px] text-slate-500">Policy Scoring</span>
              </div>
            </div>

            {/* Connecting Bar */}
            <div className="my-6 border-t-2 border-dashed border-slate-300 relative flex items-center justify-center">
              <span className="bg-slate-50 px-4 text-xs font-bold uppercase tracking-wider text-[#0B3B82]">
                Hardware Bound Verification
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center max-w-2xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Smartphone className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Real SMS / Email OTP</span>
                <span className="text-[11px] text-slate-500">Step-up Authentication</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Lock className="w-5 h-5 mx-auto text-[#0B3B82] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">User CONTINUE</span>
                <span className="text-[11px] text-slate-500">Local Laptop Gate</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <Terminal className="w-5 h-5 mx-auto text-[#15803D] mb-2" />
                <span className="text-xs font-bold text-slate-900 block">Execution &amp; Audit</span>
                <span className="text-[11px] text-slate-500">Zero-Trust Log</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          FEATURES SECTION
      ─────────────────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mb-14">
            <span className="text-xs font-bold text-[#0B3B82] uppercase tracking-wider block mb-2">
              Capabilities
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Enterprise Voice Security Platform
            </h2>
            <p className="text-sm text-slate-600 mt-3">
              Comprehensive capabilities engineered for mission-critical operations and financial compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Fingerprint,
                title: 'Speaker Identification (1:N)',
                desc: 'Identifies speakers across enrolled identity profiles using acoustic MFCC vector cosine matching.',
              },
              {
                icon: Shield,
                title: 'AI Synthetic Voice Detection',
                desc: 'Detects vocoder signatures, phase inconsistencies, and synthetic generation artifacts in real time.',
              },
              {
                icon: Radio,
                title: 'Replay Attack Detection',
                desc: 'Acoustic bandwidth analysis flags physical speaker playback, microphone distance, and room reflection.',
              },
              {
                icon: Activity,
                title: 'Dynamic Voice Liveness',
                desc: 'Randomized phrase challenge verification ensures physical, interactive human presence.',
              },
              {
                icon: Server,
                title: 'Command Risk Analysis',
                desc: 'Automated policy engine categorizes command actions from LOW to CRITICAL with parameter sanitization.',
              },
              {
                icon: Lock,
                title: 'Trusted Device Security',
                desc: 'Commands can only execute on authorized, fingerprint-verified local laptops running the VoxShield agent.',
              },
              {
                icon: Smartphone,
                title: 'Real Phone OTP (SMS)',
                desc: 'Dispatches real 6-digit verification codes via Twilio, MSG91, or Exotel with E.164 normalization.',
              },
              {
                icon: Mail,
                title: 'Email Security Notifications',
                desc: 'Immediate transactional email alerts sent when voice commands are recognized and when execution completes.',
              },
              {
                icon: FileSearch,
                title: 'Audit & Incident Forensics',
                desc: 'Detailed chronological decision timelines and forensic audio spectral inspection for every interaction.',
              },
            ].map((feat, idx) => {
              const Icon = feat.icon;
              return (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:border-[#155EAD] transition-all duration-150"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0B3B82] mb-4">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2">{feat.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────────────────────
          FOOTER
      ─────────────────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200 py-16 text-slate-600 text-xs">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-slate-100">
            {/* Brand column */}
            <div className="col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#0B3B82] flex items-center justify-center text-white">
                  <Shield className="w-4 h-4" />
                </div>
                <span className="text-base font-extrabold text-[#0B3B82]">
                  VoxShield <span className="text-[#155EAD]">AI</span>
                </span>
              </div>
              <p className="text-slate-500 max-w-sm leading-relaxed">
                "Hear the Voice. Verify the Identity. Stop the Impersonation."
              </p>
              <p className="text-[11px] text-slate-400">
                AI-Powered Real-Time Voice Identity and Anti-Impersonation Security Platform.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-bold text-slate-900 mb-3 uppercase tracking-wider text-[11px]">Product</h4>
              <ul className="space-y-2">
                <li><Link to="/voice-analyzer" className="hover:text-slate-900">Voice Analyzer</Link></li>
                <li><Link to="/command-center" className="hover:text-slate-900">Command Center</Link></li>
                <li><Link to="/attack-simulator" className="hover:text-slate-900">Attack Simulator</Link></li>
                <li><Link to="/dashboard" className="hover:text-slate-900">Dashboard</Link></li>
              </ul>
            </div>

            {/* Security */}
            <div>
              <h4 className="font-bold text-slate-900 mb-3 uppercase tracking-wider text-[11px]">Security</h4>
              <ul className="space-y-2">
                <li><Link to="/identity-enrollment" className="hover:text-slate-900">Identity Enrollment</Link></li>
                <li><Link to="/incidents" className="hover:text-slate-900">Incident Response</Link></li>
                <li><Link to="/forensics" className="hover:text-slate-900">Forensics Timeline</Link></li>
                <li><Link to="/privacy" className="hover:text-slate-900">Privacy &amp; Compliance</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-bold text-slate-900 mb-3 uppercase tracking-wider text-[11px]">Company</h4>
              <ul className="space-y-2">
                <li><span className="text-slate-500">About VoxShield</span></li>
                <li><span className="text-slate-500">Security Architecture</span></li>
                <li><span className="text-slate-500">Documentation</span></li>
                <li><span className="text-slate-500">SIH 2024 / SIH26104</span></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400">
            <p>© 2026 VoxShield AI. All rights reserved. Enterprise Cybersecurity Platform.</p>
            <p className="mt-2 sm:mt-0">Built with classical enterprise zero-trust security standards.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
