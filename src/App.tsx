import { useState, useCallback, useEffect } from 'react';
import { Target, CheckCircle2, X } from 'lucide-react';
import type {
  Handedness,
  InputMode,
  LandingResult,
  LiveTelemetry,
  ThrowRecord,
  UpgradeTriggerReason,
} from './types/biomechanics';
import {
  FREE_THROW_LIMIT,
  createSampleThrowRecord,
  generateCoachingFeedback,
} from './utils/biomechanicsEngine';
import { ViewportStage } from './components/ViewportStage';
import { TelemetryStrip } from './components/TelemetryStrip';
import { TargetLogger } from './components/TargetLogger';
import { CoachingPanel } from './components/CoachingPanel';
import { SessionHistory } from './components/SessionHistory';
import { ProUpgradeModal } from './components/ProUpgradeModal';
import { SideBySideModal } from './components/SideBySideModal';
import { exportSessionPdfReport } from './utils/pdfReport';

const PRO_STORAGE_KEY = 'dartform_pro';
const PRO_UNLOCK_CODE = 'dartmaster2026';

const INITIAL_TELEMETRY: LiveTelemetry = {
  elbowAngle: null,
  elbowDriftPct: 0,
  elbowDriftPx: 0,
  shoulderSwayPct: 0,
  maxExtensionAngle: null,
  baselineElbowY: null,
  phase: 'READY',
  hasPose: false,
  poseConfidence: 0,
};

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>('camera');
  const [handedness, setHandedness] = useState<Handedness>('right');
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL_TELEMETRY);
  const [sessionThrows, setSessionThrows] = useState<ThrowRecord[]>([]);
  const [selectedThrowId, setSelectedThrowId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const [isPro, setIsPro] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PRO_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showProBanner, setShowProBanner] = useState<boolean>(false);
  const [showProGhost, setShowProGhost] = useState<boolean>(false);

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeTriggerReason>('header_cta');
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Zero-backend URL auto-unlock (?pro_unlock=dartmaster2026)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pro_unlock') === PRO_UNLOCK_CODE) {
      try {
        localStorage.setItem(PRO_STORAGE_KEY, 'true');
      } catch {
        // Ignore storage quota errors
      }
      setIsPro(true);
      setShowProGhost(true);
      setShowProBanner(true);

      params.delete('pro_unlock');
      const remainingQuery = params.toString();
      const cleanUrl = `${window.location.pathname}${
        remainingQuery ? `?${remainingQuery}` : ''
      }${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const openUpgradeModal = useCallback((reason: UpgradeTriggerReason) => {
    setUpgradeReason(reason);
    setUpgradeModalOpen(true);
  }, []);

  const handleRestorePro = useCallback((code: string): boolean => {
    if (code.trim().toLowerCase() === PRO_UNLOCK_CODE) {
      try {
        localStorage.setItem(PRO_STORAGE_KEY, 'true');
      } catch {
        // Ignore storage errors
      }
      setIsPro(true);
      setShowProGhost(true);
      setShowProBanner(true);
      setUpgradeModalOpen(false);
      return true;
    }
    return false;
  }, []);

  const appendNewThrow = useCallback(
    (record: ThrowRecord) => {
      if (!isPro && sessionThrows.length >= FREE_THROW_LIMIT) {
        openUpgradeModal('throw_limit');
        return;
      }
      const numberedRecord: ThrowRecord = {
        ...record,
        throwNumber: sessionThrows.length + 1,
      };
      setSessionThrows((prev) => {
        const next = [numberedRecord, ...prev];
        // Auto-seed compare pair with the latest two throws
        if (next.length >= 2) {
          setCompareIds((curr) =>
            curr.length === 2 ? curr : [next[1].id, next[0].id]
          );
        }
        return next;
      });
      setSelectedThrowId(numberedRecord.id);
    },
    [isPro, sessionThrows.length, openUpgradeModal]
  );

  const handleTriggerSampleThrow = useCallback(() => {
    if (!isPro && sessionThrows.length >= FREE_THROW_LIMIT) {
      openUpgradeModal('throw_limit');
      return;
    }
    const sample = createSampleThrowRecord(sessionThrows.length + 1, handedness, inputMode);
    appendNewThrow(sample);
  }, [isPro, sessionThrows.length, handedness, inputMode, openUpgradeModal, appendNewThrow]);

  const handleSelectLanding = useCallback((throwId: string, landing: LandingResult) => {
    setSessionThrows((prev) =>
      prev.map((item) => {
        if (item.id !== throwId) return item;
        const correlated = generateCoachingFeedback({
          minDrawbackAngle: item.minDrawbackAngle,
          releaseAngle: item.releaseAngle,
          maxExtensionAngle: item.maxExtensionAngle,
          elbowDriftPct: item.elbowDriftPct,
          elbowDriftPx: item.elbowDriftPx,
          shoulderSwayPct: item.shoulderSwayPct,
          landingResult: landing,
        });
        return {
          ...item,
          landingResult: landing,
          overallStatus: correlated.overallStatus,
          flags: correlated.flags,
        };
      })
    );
  }, []);

  const handleToggleProGhost = useCallback(() => {
    if (!isPro) {
      openUpgradeModal('pro_ghost');
      return;
    }
    setShowProGhost((prev) => !prev);
  }, [isPro, openUpgradeModal]);

  const handleToggleCompareId = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  }, []);

  const handleOpenCompare = useCallback(() => {
    if (!isPro) {
      openUpgradeModal('compare_throws');
      return;
    }
    if (compareIds.length === 2) {
      setCompareModalOpen(true);
    }
  }, [isPro, compareIds.length, openUpgradeModal]);

  const handleResetSession = useCallback(() => {
    setSessionThrows([]);
    setSelectedThrowId(null);
    setCompareIds([]);
    setTelemetry(INITIAL_TELEMETRY);
  }, []);

  const selectedThrow =
    sessionThrows.find((t) => t.id === selectedThrowId) ?? sessionThrows[0] ?? null;

  const compareThrowA = sessionThrows.find((t) => t.id === compareIds[0]) ?? null;
  const compareThrowB = sessionThrows.find((t) => t.id === compareIds[1]) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Top Bar: 3 clean zones (Wordmark — Nav Links — Primary Action), 56px sticky height */}
      <header className="sticky top-0 z-30 h-14 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 font-display"
          >
            <Target className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>DartForm AI</span>
          </a>

          <nav
            aria-label="Workspace Sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#vision-stage"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Capture Stage
            </a>
            <a
              href="#coaching-panel"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Coaching
            </a>
            <a
              href="#session-history"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Session Log
            </a>
          </nav>

          {isPro ? (
            <button
              type="button"
              onClick={handleToggleProGhost}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Match Ready Pro
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openUpgradeModal('header_cta')}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Upgrade Pro
            </button>
          )}
        </div>
      </header>

      {/* Main Responsive Workspace */}
      <main
        id="top"
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6"
      >
        {/* Pro Unlocked Banner */}
        {showProBanner && (
          <div
            role="status"
            className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/12 border border-emerald-500/35 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="font-semibold text-emerald-300">Pro Unlocked!</strong>{' '}
                Unlimited session throws, Cyan Pro Ghost Overlay, and Side-by-Side Comparison are now active.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowProBanner(false)}
              aria-label="Dismiss Pro unlocked banner"
              className="min-h-[36px] min-w-[36px] rounded-lg text-emerald-300 hover:bg-emerald-500/20 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          {/* Primary Vision & Live Telemetry Column */}
          <div id="vision-stage" className="lg:col-span-7 flex flex-col gap-4">
            <ViewportStage
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              handedness={handedness}
              onHandednessChange={setHandedness}
              onTelemetryUpdate={setTelemetry}
              onThrowDetected={appendNewThrow}
              currentThrowCount={sessionThrows.length}
              isPro={isPro}
              showProGhost={showProGhost}
              onToggleProGhost={handleToggleProGhost}
              onTriggerSampleThrow={handleTriggerSampleThrow}
            />

            <TelemetryStrip telemetry={telemetry} latestThrow={selectedThrow} />
          </div>

          {/* Target Logger, Coaching Feedback & Session History Column */}
          <div id="coaching-panel" className="lg:col-span-5 flex flex-col gap-4">
            {selectedThrow && (
              <TargetLogger
                throwNumber={selectedThrow.throwNumber}
                selectedLanding={selectedThrow.landingResult}
                onSelectLanding={(landing) =>
                  handleSelectLanding(selectedThrow.id, landing)
                }
              />
            )}

            <CoachingPanel
              selectedThrow={selectedThrow}
              onTriggerSampleThrow={handleTriggerSampleThrow}
            />

            <SessionHistory
              throws={sessionThrows}
              selectedThrowId={selectedThrow?.id ?? null}
              compareIds={compareIds}
              isPro={isPro}
              onSelectThrow={setSelectedThrowId}
              onToggleCompareId={handleToggleCompareId}
              onOpenCompare={handleOpenCompare}
              onExportPdf={() => exportSessionPdfReport(sessionThrows, isPro)}
              onResetSession={handleResetSession}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-900 py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        DartForm AI · On-device MediaPipe Pose Landmarker · Zero video uploaded to servers
      </footer>

      <ProUpgradeModal
        isOpen={upgradeModalOpen}
        reason={upgradeReason}
        onClose={() => setUpgradeModalOpen(false)}
        onRestorePro={handleRestorePro}
      />

      <SideBySideModal
        isOpen={compareModalOpen}
        throwA={compareThrowA}
        throwB={compareThrowB}
        onClose={() => setCompareModalOpen(false)}
      />
    </div>
  );
}
