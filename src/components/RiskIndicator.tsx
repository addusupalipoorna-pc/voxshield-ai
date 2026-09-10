import { useEffect, useState } from 'react';
import { ServerCog, Wifi, WifiOff } from 'lucide-react';

interface ServiceItem {
  name: string;
  key: string;
  status: 'ONLINE' | 'UNAVAILABLE' | 'HEURISTIC_ONLY' | 'DEGRADED';
  version?: string | null;
  note?: string | null;
}

interface ModelStatusResponse {
  phase: number;
  services: ServiceItem[];
}

type FetchState = 'IDLE' | 'LOADING' | 'OK' | 'BACKEND_DOWN';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const dotClass: Record<ServiceItem['status'], string> = {
  ONLINE: 'bg-emerald-600',
  UNAVAILABLE: 'bg-red-500',
  HEURISTIC_ONLY: 'bg-amber-500',
  DEGRADED: 'bg-amber-500 animate-pulse',
};

const labelClass: Record<ServiceItem['status'], string> = {
  ONLINE: 'text-emerald-700 font-bold',
  UNAVAILABLE: 'text-red-700 font-semibold',
  HEURISTIC_ONLY: 'text-amber-800 font-semibold',
  DEGRADED: 'text-amber-800 font-semibold',
};

const labelText: Record<ServiceItem['status'], string> = {
  ONLINE: 'ONLINE',
  UNAVAILABLE: 'UNAVAILABLE',
  HEURISTIC_ONLY: 'HEURISTIC ONLY',
  DEGRADED: 'DEGRADED',
};

// Fallback shown when backend is not reachable
const FALLBACK_SERVICES: ServiceItem[] = [
  { name: 'Deepfake Detection Model', key: 'deepfake', status: 'UNAVAILABLE' },
  { name: 'Speaker Embedding Model (ECAPA-TDNN)', key: 'speaker', status: 'UNAVAILABLE' },
  { name: 'Replay / Spoof Detector', key: 'replay', status: 'UNAVAILABLE' },
  { name: 'Speech-to-Text (Whisper)', key: 'stt', status: 'UNAVAILABLE' },
  { name: 'Risk Engine (backend)', key: 'risk', status: 'UNAVAILABLE' },
  { name: 'Laptop Agent', key: 'agent', status: 'UNAVAILABLE' },
  { name: 'Heuristic Audio Signal Analysis', key: 'heuristic', status: 'HEURISTIC_ONLY' },
];

export function RiskIndicator() {
  const [fetchState, setFetchState] = useState<FetchState>('IDLE');
  const [services, setServices] = useState<ServiceItem[]>(FALLBACK_SERVICES);
  const [phase, setPhase] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      setFetchState('LOADING');
      try {
        const res = await fetch(`${API_BASE}/api/v1/model-status`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ModelStatusResponse = await res.json();
        if (!cancelled) {
          setServices(data.services);
          setPhase(data.phase);
          setFetchState('OK');
        }
      } catch {
        if (!cancelled) {
          setServices(FALLBACK_SERVICES);
          setFetchState('BACKEND_DOWN');
        }
      }
    }

    fetchStatus();
    // Poll every 30 s to pick up when backend starts
    const interval = setInterval(fetchStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ServerCog size={15} className="text-[#0B3B82]" strokeWidth={1.8} />
          <h2 className="text-[13px] font-bold text-slate-900">Pipeline Status</h2>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {fetchState === 'OK' ? (
            <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <Wifi size={12} />
              BACKEND LIVE {phase !== null ? `· PHASE ${phase}` : ''}
            </span>
          ) : fetchState === 'BACKEND_DOWN' ? (
            <span className="flex items-center gap-1.5 text-amber-800 font-bold">
              <WifiOff size={12} />
              BACKEND OFFLINE
            </span>
          ) : (
            <span className="text-slate-500 font-medium">CHECKING…</span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        {fetchState === 'OK'
          ? 'Live status from backend — nothing is faked as "online."'
          : 'Honest status of each pipeline stage. Start the backend to see live data.'}
      </p>

      <div className="space-y-2">
        {services.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-[12px] font-mono py-1">
            <span className="flex items-center gap-2 text-vs-dim">
              <span className={`w-[7px] h-[7px] rounded-full ${dotClass[s.status]}`} />
              {s.name}
              {s.version && (
                <span className="text-[10px] text-vs-dim/60">v{s.version}</span>
              )}
            </span>
            <span className={labelClass[s.status]}>{labelText[s.status]}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-vs-dim mt-3.5 leading-relaxed">
        {fetchState === 'BACKEND_DOWN'
          ? 'Backend not reachable — run uvicorn in backend/ to connect. Showing cached status.'
          : 'Phase 2: FastAPI backend online. Real ML services connect in Phases 5-12.'}
      </p>
    </div>
  );
}
