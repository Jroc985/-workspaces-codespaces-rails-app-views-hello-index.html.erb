import React from 'react';
import {
  GitCompareArrows,
  Trash2,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FileDown,
} from 'lucide-react';
import type { ThrowRecord } from '../types/biomechanics';
import { FREE_THROW_LIMIT } from '../utils/biomechanicsEngine';

interface SessionHistoryProps {
  throws: ThrowRecord[];
  selectedThrowId: string | null;
  compareIds: string[];
  isPro: boolean;
  onSelectThrow: (id: string) => void;
  onToggleCompareId: (id: string) => void;
  onOpenCompare: () => void;
  onExportPdf: () => void;
  onResetSession: () => void;
}

const LANDING_SHORT: Record<string, string> = {
  T20: 'T20 Hit',
  HIGH: 'High',
  LOW: 'Low',
  LEFT: 'Left',
  RIGHT: 'Right',
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  throws,
  selectedThrowId,
  compareIds,
  isPro,
  onSelectThrow,
  onToggleCompareId,
  onOpenCompare,
  onExportPdf,
  onResetSession,
}) => {
  const canCompareNow = throws.length >= 2 && compareIds.length === 2;

  return (
    <section
      id="session-history"
      aria-label="Session Throw History"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-slate-100 truncate">
            Session History
          </h2>
          <p className="text-xs text-slate-400 tabular-nums mt-0.5">
            {isPro
              ? `Match Ready · ${throws.length} throws logged (Unlimited)`
              : `Practice Board · ${throws.length} / ${FREE_THROW_LIMIT} free throws`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {throws.length > 0 && (
            <button
              type="button"
              onClick={onResetSession}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Throw Rows */}
      {throws.length === 0 ? (
        <div className="py-8 px-4 text-center border border-dashed border-slate-800 rounded-xl">
          <p className="text-xs sm:text-sm font-medium text-slate-300">
            No throws logged in this session yet
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Each detected Drawback → Acceleration → Follow-Through cycle will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800 border-t border-b border-slate-800">
          {throws.map((item) => {
            const isSelected = item.id === selectedThrowId;
            const isCheckedForCompare = compareIds.includes(item.id);
            const isOptimal = item.overallStatus === 'optimal';
            const primaryFlagTitle = item.flags[0]?.title ?? 'Reviewed';

            return (
              <div
                key={item.id}
                className={`min-h-[60px] py-2.5 px-2 flex items-center justify-between gap-2.5 rounded-lg transition-colors ${
                  isSelected ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                }`}
              >
                {/* Compare Selection Checkbox (only shown when 2+ throws exist) */}
                {throws.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onToggleCompareId(item.id)}
                    aria-label={`Select Throw #${item.throwNumber} for side-by-side comparison`}
                    aria-pressed={isCheckedForCompare}
                    className={`min-h-[36px] min-w-[36px] rounded-lg border flex items-center justify-center text-xs font-mono shrink-0 cursor-pointer transition-colors ${
                      isCheckedForCompare
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                        : 'bg-slate-950 border-slate-700 text-slate-500 hover:border-slate-500'
                    }`}
                  >
                    {isCheckedForCompare ? '✓' : ''}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onSelectThrow(item.id)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2.5 text-left cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isOptimal
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      {isOptimal ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-100">
                        <span className="tabular-nums shrink-0">Throw #{item.throwNumber}</span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`text-xs font-medium truncate ${
                            isOptimal ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {primaryFlagTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                        <span>Ext {item.maxExtensionAngle}°</span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          Drift {item.elbowDriftPct > 0 ? `+${item.elbowDriftPct}` : item.elbowDriftPct}%
                        </span>
                        {item.landingResult && (
                          <>
                            <span className="text-slate-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-sans text-slate-300">
                              {LANDING_SHORT[item.landingResult]}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isSelected ? 'text-emerald-400 translate-x-0.5' : 'text-slate-500'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Action Buttons */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={throws.length === 0}
          onClick={onExportPdf}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <FileDown className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">Export Session Report</span>
        </button>

        <button
          type="button"
          disabled={throws.length < 2}
          onClick={onOpenCompare}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 text-slate-100 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          {isPro ? (
            <GitCompareArrows className="w-4 h-4 text-cyan-400 shrink-0" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="whitespace-nowrap">
            {throws.length < 2
              ? 'Log 2 Throws to Compare Side-by-Side'
              : canCompareNow
              ? 'Compare Selected Throws Side-by-Side'
              : 'Select 2 Throws to Compare'}
          </span>
        </button>
      </div>
    </section>
  );
};
