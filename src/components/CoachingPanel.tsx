import React from 'react';
import { CheckCircle2, AlertTriangle, Crosshair } from 'lucide-react';
import type { ThrowRecord } from '../types/biomechanics';

interface CoachingPanelProps {
  selectedThrow: ThrowRecord | null;
  onTriggerSampleThrow: () => void;
}

const LANDING_LABELS: Record<string, string> = {
  T20: 'On Target / T20',
  HIGH: 'Missed High',
  LOW: 'Missed Low',
  LEFT: 'Missed Left',
  RIGHT: 'Missed Right',
};

function AngleCurveSvg({ points }: { points: number[] }) {
  if (!points || points.length < 2) return null;

  const width = 320;
  const height = 72;
  const minVal = 40;
  const maxVal = 180;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const y = height - ((clamped - minVal) / (maxVal - minVal)) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const targetY = height - ((160 - minVal) / (maxVal - minVal)) * (height - 12) - 6;
  const peakVal = Math.max(...points);
  const strokeColor = peakVal >= 160 ? '#22C55E' : '#F59E0B';

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/80">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
        <span>Elbow Angle Trajectory (Drawback → Release)</span>
        <span className="font-mono tabular-nums text-slate-300">
          {Math.min(...points)}° → {peakVal}°
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[72px] overflow-visible"
        role="img"
        aria-label="Elbow angle trajectory curve"
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
        <text
          x={width - 2}
          y={targetY - 4}
          textAnchor="end"
          fill="#64748B"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
        >
          160° target
        </text>
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.join(' ')}
        />
      </svg>
    </div>
  );
}

export const CoachingPanel: React.FC<CoachingPanelProps> = ({
  selectedThrow,
  onTriggerSampleThrow,
}) => {
  if (!selectedThrow) {
    return (
      <section
        aria-label="Biomechanical Coaching Feedback"
        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
            <Crosshair className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm sm:text-base font-semibold text-slate-100">
              Automated Coaching Ready
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Complete a throw cycle (Drawback → Forward Acceleration → Follow-Through) to log target landing correlation and arm diagnostics.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            Testing without a dartboard?
          </span>
          <button
            type="button"
            onClick={onTriggerSampleThrow}
            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Simulate Sample Throw
          </button>
        </div>
      </section>
    );
  }

  const isOptimal = selectedThrow.overallStatus === 'optimal';

  return (
    <section
      aria-label="Biomechanical Coaching Feedback"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {isOptimal ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <h2 className="text-sm sm:text-base font-semibold text-slate-100 truncate">
            Throw #{selectedThrow.throwNumber} Insights
          </h2>
        </div>

        <span
          className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
            isOptimal ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {isOptimal ? 'Optimal Form' : 'Adjustment Needed'}
        </span>
      </div>

      {/* Key Biomechanical Metrics Summary */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 pb-3 border-b border-slate-800/80">
        <span>
          Drawback:{' '}
          <strong className="font-mono tabular-nums text-slate-200">
            {selectedThrow.minDrawbackAngle}°
          </strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Release:{' '}
          <strong className="font-mono tabular-nums text-slate-200">
            {selectedThrow.releaseAngle}°
          </strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Sway:{' '}
          <strong className="font-mono tabular-nums text-slate-200">
            {selectedThrow.shoulderSwayPct.toFixed(1)}%
          </strong>
        </span>
        {selectedThrow.landingResult && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-300 font-medium">
              {LANDING_LABELS[selectedThrow.landingResult]}
            </span>
          </>
        )}
      </div>

      {/* Rule-Based & Target-Correlated Coaching Cue List */}
      <div className="mt-3 space-y-2.5">
        {selectedThrow.flags.map((flag) => (
          <div
            key={flag.id}
            className={`rounded-xl p-3 border ${
              flag.severity === 'good'
                ? 'bg-emerald-500/8 border-emerald-500/25'
                : 'bg-amber-500/8 border-amber-500/25'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className={`text-xs font-semibold ${
                  flag.severity === 'good' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {flag.title}
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {flag.severity === 'good' ? 'Passed' : 'Cue'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{flag.detail}</p>
          </div>
        ))}
      </div>

      <AngleCurveSvg points={selectedThrow.angleTrajectory} />
    </section>
  );
};
