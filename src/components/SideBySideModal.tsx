import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ThrowRecord } from '../types/biomechanics';

interface SideBySideModalProps {
  isOpen: boolean;
  throwA: ThrowRecord | null;
  throwB: ThrowRecord | null;
  onClose: () => void;
}

const LANDING_LABELS: Record<string, string> = {
  T20: 'On Target / T20',
  HIGH: 'Missed High',
  LOW: 'Missed Low',
  LEFT: 'Missed Left',
  RIGHT: 'Missed Right',
};

function DualCurveSvg({ a, b }: { a: ThrowRecord; b: ThrowRecord }) {
  const width = 340;
  const height = 96;
  const minVal = 40;
  const maxVal = 180;

  const toPolyline = (pts: number[]) => {
    if (!pts || pts.length < 2) return '';
    return pts
      .map((val, idx) => {
        const x = (idx / (pts.length - 1)) * width;
        const clamped = Math.max(minVal, Math.min(maxVal, val));
        const y = height - ((clamped - minVal) / (maxVal - minVal)) * (height - 14) - 7;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const targetY = height - ((160 - minVal) / (maxVal - minVal)) * (height - 14) - 7;

  return (
    <div className="mt-4 pt-3 border-t border-slate-800">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span>Elbow Angle Trajectory Overlay</span>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-emerald-400">Throw #{a.throwNumber}</span>
          <span className="text-cyan-400">Throw #{b.throwNumber}</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[96px] overflow-visible"
        role="img"
        aria-label="Side-by-side elbow angle comparison"
      >
        <line
          x1={0}
          y1={targetY}
          x2={width}
          y2={targetY}
          stroke="#334155"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <polyline
          fill="none"
          stroke="#22C55E"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPolyline(a.angleTrajectory)}
        />
        <polyline
          fill="none"
          stroke="#22D3EE"
          strokeWidth={2.5}
          strokeDasharray="5 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPolyline(b.angleTrajectory)}
        />
      </svg>
    </div>
  );
}

export const SideBySideModal: React.FC<SideBySideModalProps> = ({
  isOpen,
  throwA,
  throwB,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !throwA || !throwB) return null;

  const rows = [
    {
      label: 'Min Drawback',
      valA: `${throwA.minDrawbackAngle}°`,
      valB: `${throwB.minDrawbackAngle}°`,
      delta: `${throwB.minDrawbackAngle - throwA.minDrawbackAngle >= 0 ? '+' : ''}${
        throwB.minDrawbackAngle - throwA.minDrawbackAngle
      }°`,
    },
    {
      label: 'Release Angle',
      valA: `${throwA.releaseAngle}°`,
      valB: `${throwB.releaseAngle}°`,
      delta: `${throwB.releaseAngle - throwA.releaseAngle >= 0 ? '+' : ''}${
        throwB.releaseAngle - throwA.releaseAngle
      }°`,
    },
    {
      label: 'Follow-Through',
      valA: `${throwA.maxExtensionAngle}°`,
      valB: `${throwB.maxExtensionAngle}°`,
      delta: `${throwB.maxExtensionAngle - throwA.maxExtensionAngle >= 0 ? '+' : ''}${
        throwB.maxExtensionAngle - throwA.maxExtensionAngle
      }°`,
    },
    {
      label: 'Elbow Drift',
      valA: `${throwA.elbowDriftPct > 0 ? '+' : ''}${throwA.elbowDriftPct.toFixed(1)}%`,
      valB: `${throwB.elbowDriftPct > 0 ? '+' : ''}${throwB.elbowDriftPct.toFixed(1)}%`,
      delta: `${throwB.elbowDriftPct - throwA.elbowDriftPct >= 0 ? '+' : ''}${(
        throwB.elbowDriftPct - throwA.elbowDriftPct
      ).toFixed(1)}%`,
    },
    {
      label: 'Shoulder Sway',
      valA: `${throwA.shoulderSwayPct.toFixed(1)}%`,
      valB: `${throwB.shoulderSwayPct.toFixed(1)}%`,
      delta: `${throwB.shoulderSwayPct - throwA.shoulderSwayPct >= 0 ? '+' : ''}${(
        throwB.shoulderSwayPct - throwA.shoulderSwayPct
      ).toFixed(1)}%`,
    },
    {
      label: 'Landing Spot',
      valA: throwA.landingResult ? LANDING_LABELS[throwA.landingResult] : 'Unlogged',
      valB: throwB.landingResult ? LANDING_LABELS[throwB.landingResult] : 'Unlogged',
      delta: '—',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-cyan-400">
              Match Ready Comparison
            </span>
            <h2 id="compare-modal-title" className="text-lg font-bold text-slate-50">
              Throw #{throwA.throwNumber} vs. Throw #{throwB.throwNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-medium text-slate-400">
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 px-2 text-right text-emerald-400 font-mono">
                  #{throwA.throwNumber}
                </th>
                <th className="py-2 px-2 text-right text-cyan-400 font-mono">
                  #{throwB.throwNumber}
                </th>
                <th className="py-2 pl-2 text-right font-mono">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="py-2.5 pr-3 text-slate-300 font-medium">{row.label}</td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-100">
                    {row.valA}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-100">
                    {row.valB}
                  </td>
                  <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-slate-400">
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DualCurveSvg a={throwA} b={throwB} />
      </div>
    </div>
  );
};
