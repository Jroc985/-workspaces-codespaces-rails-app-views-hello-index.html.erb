import React from 'react';
import { Target } from 'lucide-react';
import type { LandingResult } from '../types/biomechanics';

interface TargetLoggerProps {
  throwNumber: number;
  selectedLanding: LandingResult | null;
  onSelectLanding: (result: LandingResult) => void;
}

const LANDING_OPTIONS: { value: LandingResult; label: string }[] = [
  { value: 'T20', label: 'On Target / T20' },
  { value: 'HIGH', label: 'Missed High' },
  { value: 'LOW', label: 'Missed Low' },
  { value: 'LEFT', label: 'Missed Left' },
  { value: 'RIGHT', label: 'Missed Right' },
];

export const TargetLogger: React.FC<TargetLoggerProps> = ({
  throwNumber,
  selectedLanding,
  onSelectLanding,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-slate-100">
            Where did the dart land? (Throw #{throwNumber})
          </span>
        </div>
        {selectedLanding && (
          <span className="text-[11px] font-medium text-emerald-400 whitespace-nowrap">
            Correlated
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label="Target landing spot selector"
        className="flex flex-wrap gap-2"
      >
        {LANDING_OPTIONS.map((opt) => {
          const isActive = selectedLanding === opt.value;
          const isCenter = opt.value === 'T20';

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectLanding(opt.value)}
              aria-pressed={isActive}
              className={`min-h-[40px] px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                isActive
                  ? isCenter
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                    : 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
