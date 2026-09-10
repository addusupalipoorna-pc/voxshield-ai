import React, { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Radio,
  Play,
  Activity,
  UserCheck,
  RotateCw,
  Info,
  ArrowRight,
} from 'lucide-react';

interface Scenario {
  id: string;
  title: string;
  description: string;
  attackType: string;
  icon: string;
  expected: 'BLOCK' | 'ALLOW' | 'VERIFY';
  steps: string[];
  pipelineResults: {
    deepfake: { label: string; probability: number };
    speaker: { label: string; similarity: number | null };
    replay: { label: string; probability: number };
    risk: { score: number; level: string; decision: string };
    command: { intent: string; risk: string };
  };
  narrative: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'legitimate',
    title: 'Scenario 1: Legitimate Authorized Speaker',
    description: 'Enrolled user issues a benign command — zero-trust policy authorizes execution.',
    attackType: 'NORMAL',
    icon: '✓',
    expected: 'ALLOW',
    steps: [
      'User speaks: "Open Calculator"',
      'Audio captured from enrolled microphone',
      'Anti-Deepfake Engine: Voice is natural, harmonics consistent',
      'Speaker Verification: Cosine embedding similarity 0.91 (MATCH)',
      'Replay Detection: No reverberation or playback artifacts detected',
      'Risk Engine: Score 12/100 (SAFE)',
      'CONTINUE Gate: Allowed for local laptop workstation execution',
    ],
    pipelineResults: {
      deepfake: { label: 'LIKELY_GENUINE', probability: 0.04 },
      speaker: { label: 'MATCH', similarity: 0.91 },
      replay: { label: 'CLEAR', probability: 0.05 },
      risk: { score: 12, level: 'SAFE', decision: 'ALLOW' },
      command: { intent: 'OPEN_CALCULATOR', risk: 'LOW' },
    },
    narrative:
      "The registered user's voice passes all verification layers. Natural acoustic spectral distribution, strong 1:N speaker vector match, and clean impulse response. System approves the request for laptop execution.",
  },
  {
    id: 'ai_clone',
    title: 'Scenario 2: AI Voice Clone / Deepfake Ingress',
    description: 'Adversary injects high-fidelity neural cloned speech — deepfake engine blocks.',
    attackType: 'AI_VOICE',
    icon: '⚠',
    expected: 'BLOCK',
    steps: [
      'Attacker plays AI-synthesized audio targeting the executive',
      'Audio captured and spectral harmonics analyzed',
      'Anti-Deepfake Engine: Spectral flatness abnormal, neural vocoder phase artifacts detected',
      'Speaker Verification: Cosine distance exceeds tolerance (MISMATCH)',
      'Replay Detection: Audio compression boundaries flagged',
      'Risk Engine: Score 87/100 (CRITICAL)',
      'BLOCKED: Security incident logged, command rejected',
    ],
    pipelineResults: {
      deepfake: { label: 'LIKELY_SYNTHETIC', probability: 0.87 },
      speaker: { label: 'MISMATCH', similarity: 0.42 },
      replay: { label: 'REPLAY_SUSPECTED', probability: 0.62 },
      risk: { score: 87, level: 'CRITICAL', decision: 'BLOCK' },
      command: { intent: 'OPEN_WHATSAPP', risk: 'LOW' },
    },
    narrative:
      'AI-generated speech is exposed through abnormal spectral uniformity and phase jitter. The speaker MFCC embedding falls outside the enrolled cluster. System blocks the action immediately.',
  },
  {
    id: 'replay',
    title: 'Scenario 3: Physical Audio Replay Attack',
    description: 'Adversary replays authentic recording through an external speaker — room impulse engine detects.',
    attackType: 'REPLAY_ATTACK',
    icon: '⟲',
    expected: 'BLOCK',
    steps: [
      'Attacker plays pre-recorded voice note via smartphone loudspeaker',
      'Microphone captures acoustic output with room reflection',
      'Anti-Deepfake: Inconclusive (audio originated from genuine voice)',
      'Speaker Verification: Partial match (0.61)',
      'Replay Detection: High-frequency loudspeaker roll-off detected below 2.4 kHz',
      'Risk Engine: Score 71/100 (HIGH)',
      'BLOCKED: Physical replay signature flagged',
    ],
    pipelineResults: {
      deepfake: { label: 'INCONCLUSIVE', probability: 0.35 },
      speaker: { label: 'INCONCLUSIVE', similarity: 0.61 },
      replay: { label: 'REPLAY_DETECTED', probability: 0.78 },
      risk: { score: 71, level: 'HIGH', decision: 'BLOCK' },
      command: { intent: 'OPEN_SETTINGS', risk: 'LOW' },
    },
    narrative:
      'Even when using a real recorded human voice, speaker diaphragm frequency coloration and secondary room reflections betray the replay attempt. System blocks unauthorized execution.',
  },
  {
    id: 'high_risk_command',
    title: 'Scenario 4: High-Risk Command Escalation',
    description: 'Legitimate speaker requests privileged command — policy enforces secondary 2FA approval.',
    attackType: 'HIGH_RISK_COMMAND',
    icon: '◈',
    expected: 'VERIFY',
    steps: [
      'User speaks: "Format disk partition C"',
      'Speaker verified as enrolled admin (0.94)',
      'Deepfake & Replay checks: CLEAR',
      'Intent Engine: Categorized as SENSITIVE_SYSTEM_MUTATION',
      'Risk Engine: High-risk command requires multi-factor approval',
      'ESCALATION: Email approval link & 6-digit OTP dispatched',
      'Awaiting secondary confirmation before laptop execution gate',
    ],
    pipelineResults: {
      deepfake: { label: 'LIKELY_GENUINE', probability: 0.03 },
      speaker: { label: 'MATCH', similarity: 0.94 },
      replay: { label: 'CLEAR', probability: 0.04 },
      risk: { score: 55, level: 'CAUTION', decision: 'APPROVAL_REQUIRED' },
      command: { intent: 'FORMAT_DISK', risk: 'HIGH' },
    },
    narrative:
      'Voice biometric identity is confirmed, but the command intent alters system state. Policy intercepts and requires an out-of-band email approval and 6-digit OTP before the laptop CONTINUE gate activates.',
  },
];

export default function AttackSimulator() {
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);

  const runScenario = async (scenario: Scenario) => {
    setSelected(scenario);
    setDone(false);
    setCurrentStep(-1);
    setRunning(true);

    for (let i = 0; i < scenario.steps.length; i++) {
      setCurrentStep(i);
      await new Promise((r) => setTimeout(r, 600));
    }

    setRunning(false);
    setDone(true);
  };

  const pr = selected?.pipelineResults;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans text-slate-900 space-y-6">
      
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="text-[#0B3B82] font-bold">VoxShield AI</span>
          <span>/</span>
          <span className="text-slate-800">Threat Simulation Sandbox</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
          Interactive Threat Simulator
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Simulate multi-vector voice attacks to inspect zero-trust policy decisions, spectral anomaly flags, and command escalations.
        </p>
      </div>

      {/* Demo Warning Banner */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-slate-700">
        <Info className="w-4 h-4 text-[#0B3B82] shrink-0" />
        <span>
          <strong>Interactive Test Environment:</strong> These scenarios demonstrate expected real-world outputs across synthetic deepfake, physical replay, and high-risk command vectors.
        </span>
      </div>

      {/* Grid: Scenario Selection (Left) + Pipeline Execution (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 5 cols: Scenarios */}
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Select Simulation Scenario
          </h2>
          {SCENARIOS.map((sc) => {
            const isSelected = selected?.id === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => runScenario(sc)}
                disabled={running}
                className={`w-full p-4 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? 'bg-blue-50/70 border-[#0B3B82] shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50 shadow-sm'
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800">{sc.title}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      sc.expected === 'ALLOW'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : sc.expected === 'BLOCK'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {sc.expected}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{sc.description}</p>
              </button>
            );
          })}
        </div>

        {/* Right 7 cols: Pipeline Results */}
        <div className="lg:col-span-7 space-y-6">
          {!selected ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 shadow-sm text-center flex flex-col items-center justify-center min-h-[420px]">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0B3B82] mb-3">
                <Play className="w-6 h-6 fill-current" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Select a Threat Scenario</h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Click any scenario on the left to initiate the simulated zero-trust verification pipeline step by step.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Scenario Narrative Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0B3B82] block mb-1">
                  Active Simulation Dossier
                </span>
                <h3 className="text-base font-bold text-slate-900 mb-2">{selected.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{selected.narrative}</p>
              </div>

              {/* Step Execution Sequence */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Pipeline Execution Progress
                </h4>
                <div className="space-y-2">
                  {selected.steps.map((step, idx) => {
                    const completed = idx <= currentStep;
                    const active = idx === currentStep && running;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
                          active
                            ? 'bg-blue-50/80 border-[#0B3B82] text-[#0B3B82] font-bold shadow-xs'
                            : completed
                            ? 'bg-slate-50 border-slate-200 text-slate-800'
                            : 'bg-white border-transparent text-slate-400'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            completed ? 'bg-[#0B3B82] text-white' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {completed ? '✓' : idx + 1}
                        </div>
                        <span className="leading-snug">{step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Final Pipeline Metrics */}
              {done && pr && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Zero-Trust Policy Outcome
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase border ${
                        pr.risk.decision === 'ALLOW'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : pr.risk.decision === 'BLOCK'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      DECISION: {pr.risk.decision}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Deepfake Prob</span>
                      <span className="font-bold text-slate-800 mt-0.5 block">
                        {(pr.deepfake.probability * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Speaker Match</span>
                      <span className="font-bold text-slate-800 mt-0.5 block">
                        {pr.speaker.similarity !== null ? `${(pr.speaker.similarity * 100).toFixed(0)}%` : 'N/A'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Replay Prob</span>
                      <span className="font-bold text-slate-800 mt-0.5 block">
                        {(pr.replay.probability * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Threat Score</span>
                      <span className="font-bold text-slate-800 mt-0.5 block">
                        {pr.risk.score}/100
                      </span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
