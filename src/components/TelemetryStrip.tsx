import React from 'react';
import type { LiveTelemetry, ThrowRecord } from '../types/biomechanics';

interface TelemetryStripProps {
  telemetry: LiveTelemetry;
  latestThrow: ThrowRecord | null;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({ telemetry, latestThrow }) => {
  const displayAngle = telemetry.hasPose
    ? telemetry.elbowAngle
    : latestThrow?.maxExtensionAngle ?? null;

  const activeDriftPct = telemetry.hasPose
    ? telemetry.elbowDriftPct
    : latestThrow?.elbowDriftPct ?? 0;

  const activeDriftPx = telemetry.hasPose
    ? telemetry.elbowDriftPx
    : latestThrow?.elbowDriftPx ?? 0;

  const activeFollowThrough =
    telemetry.hasPose && telemetry.maxExtensionAngle !== null
      ? telemetry.maxExtensionAngle
      : latestThrow?.maxExtensionAngle ?? null;

  const isDriftWarning = Math.abs(activeDriftPct) > 3.5 || Math.abs(activeDriftPx) > 18;
  const isFollowShort = activeFollowThrough !== null && activeFollowThrough < 160;

  return (
    <section aria-label="Real-Time Biomechanical Telemetry" className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {/* 1. Elbow Angle */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-1.5">
        <span className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
          Elbow Angle
        </span>
        <div className="font-mono text-xl sm:text-2xl font-bold text-slate-50 tabular-nums tracking-tight">
          {displayAngle !== null ? `${displayAngle}°` : '--°'}
        </div>
        <div className="text-[11px] text-slate-400 truncate">
          {telemetry.hasPose ? 'Live joint arc' : 'Pullback < 85°'}
        </div>
      </div>

      {/* 2. Elbow Stability / Drift */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-1.5">
        <span className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
          Elbow Drift
        </span>
        <div
          className={`font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${
            isDriftWarning ? 'text-amber-400' : 'text-emerald-400'
          }`}
        >
          {activeDriftPct > 0 ? `+${activeDriftPct.toFixed(1)}%` : `${activeDriftPct.toFixed(1)}%`}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] truncate">
          <span className={isDriftWarning ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
            {isDriftWarning ? (activeDriftPct > 0 ? 'Drop' : 'Lift') : 'Stable'}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-slate-400 tabular-nums">
            {activeDriftPx > 0 ? `+${activeDriftPx}` : activeDriftPx}px
          </span>
        </div>
      </div>

      {/* 3. Follow-Through Extension */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-1.5">
        <span className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
          Follow-Through
        </span>
        <div
          className={`font-mono text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${
            activeFollowThrough === null
              ? 'text-slate-50'
              : isFollowShort
              ? 'text-amber-400'
              : 'text-emerald-400'
          }`}
        >
          {activeFollowThrough !== null ? `${activeFollowThrough}°` : '--°'}
        </div>
        <div className="text-[11px] truncate">
          {activeFollowThrough === null ? (
            <span className="text-slate-400">Target ≥ 160°</span>
          ) : isFollowShort ? (
            <span className="text-amber-300 font-medium">Under 160°</span>
          ) : (
            <span className="text-emerald-300 font-medium">Full Ext.</span>
          )}
        </div>
      </div>
    </section>
  );
};
