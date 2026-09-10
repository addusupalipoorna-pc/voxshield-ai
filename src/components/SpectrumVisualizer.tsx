import { useEffect, useRef } from 'react';

interface Props {
  getAnalyser: () => AnalyserNode | null;
  isLive: boolean;
}

const BAR_COUNT = 96;

export function SpectrumVisualizer({ getAnalyser, isLive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!isLive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const draw = () => {
      const analyser = getAnalyser();
      const canvas = canvasRef.current;
      if (!analyser || !canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const ratio = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
        canvas.width = w * ratio;
        canvas.height = h * ratio;
      }

      if (!bufRef.current || bufRef.current.length !== analyser.frequencyBinCount) {
        bufRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(bufRef.current as Uint8Array<ArrayBuffer>);
      const freqData = bufRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const step = Math.floor(freqData.length / 2 / BAR_COUNT);
      const barW = canvas.width / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freqData[i * step + j] || 0;
        const avg = sum / step;
        const barH = (avg / 255) * canvas.height;
        ctx.fillStyle = avg > 160 ? '#D97706' : '#155EAD';
        ctx.fillRect(i * barW, canvas.height - barH, barW * 0.8, barH);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isLive, getAnalyser]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[90px] block rounded-xl bg-slate-50 border border-slate-200 mt-2.5"
    />
  );
}
