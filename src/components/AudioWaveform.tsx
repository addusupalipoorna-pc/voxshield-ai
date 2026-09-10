import { useEffect, useRef } from 'react';

interface Props {
  getAnalyser: () => AnalyserNode | null;
  isLive: boolean;
}

export function AudioWaveform({ getAnalyser, isLive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bufRef = useRef<Float32Array | null>(null);

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

      if (!bufRef.current || bufRef.current.length !== analyser.fftSize) {
        bufRef.current = new Float32Array(analyser.fftSize);
      }
      analyser.getFloatTimeDomainData(bufRef.current as Float32Array<ArrayBuffer>);
      const data = bufRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0B3B82';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const step = canvas.width / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = canvas.height / 2 + data[i] * canvas.height * 0.45;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

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
      className="w-full h-[120px] block rounded-xl bg-slate-50 border border-slate-200"
    />
  );
}
