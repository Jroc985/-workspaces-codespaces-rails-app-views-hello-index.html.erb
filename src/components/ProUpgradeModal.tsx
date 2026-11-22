import React, { useEffect, useState } from 'react';
import { X, Check, ArrowUpRight, Lock, KeyRound } from 'lucide-react';
import type { UpgradeTriggerReason } from '../types/biomechanics';

interface ProUpgradeModalProps {
  isOpen: boolean;
  reason: UpgradeTriggerReason;
  onClose: () => void;
  onRestorePro: (code: string) => boolean;
}

const STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/YOUR_STRIPE_LINK';

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({
  isOpen,
  reason,
  onClose,
  onRestorePro,
}) => {
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRestoreError(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const headline =
    reason === 'throw_limit'
      ? 'Free Practice Limit Reached (3 Throws)'
      : reason === 'pro_ghost'
      ? 'Unlock Cyan Pro Ghost Overlay'
      : reason === 'compare_throws'
      ? 'Unlock Side-by-Side Throw Comparison'
      : 'Upgrade to DartForm Pro';

  const subtext =
    reason === 'throw_limit'
      ? 'Practice Board includes 3 analyzed throws per session. Upgrade to Match Ready for unlimited throws to track fatigue across 50-leg routines.'
      : reason === 'pro_ghost'
      ? 'Overlay a calibrated cyan reference skeleton scaled to your arm length (~65° drawback, zero elbow drop, 170°+ extension).'
      : reason === 'compare_throws'
      ? 'Compare Throw #1 vs. Throw #50 side-by-side to spot fatigue-induced elbow drop and trajectory drift.'
      : 'Unlock unlimited session throws, the cyan Pro Ghost reference overlay, and side-by-side throw comparisons.';

  const proFeatures = [
    'Unlimited throws per session (50-leg fatigue tracking)',
    'Pro Ghost Overlay (stationary elbow anchor + ideal mechanics)',
    'Side-by-Side Throw Comparison & overlaid angle curves',
  ];

  const handleRestoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onRestorePro(restoreCode);
    if (!ok) {
      setRestoreError('Invalid unlock code. Enter "dartmaster2026" to restore Pro access.');
    } else {
      setRestoreCode('');
      setRestoreError(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-cyan-400">
                Match Ready Pro Tier
              </span>
              <h2
                id="pro-modal-title"
                className="text-lg font-bold text-slate-50 leading-snug"
              >
                {headline}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close upgrade modal"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">{subtext}</p>

        {/* Pro Capabilities */}
        <ul className="mt-4 space-y-2">
          {proFeatures.map((feat) => (
            <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{feat}</span>
            </li>
          ))}
        </ul>

        {/* Dual-Option Stripe Checkout */}
        <div className="mt-5 space-y-2.5">
          {/* Option 1: Lifetime Pass */}
          <a
            href={STRIPE_PAYMENT_LINK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[56px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="text-left">
              <div className="text-sm font-bold leading-tight">
                Lifetime Pass — $14.99
              </div>
              <div className="text-[11px] font-medium text-slate-900/80">
                One-time payment · Permanent Match Ready unlock
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 shrink-0" />
          </a>

          {/* Option 2: Season Pass */}
          <a
            href={STRIPE_PAYMENT_LINK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[52px] px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-100 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="text-left">
              <div className="text-sm font-semibold leading-tight">
                Season Pass — $4.99 / month
              </div>
              <div className="text-[11px] text-slate-400">
                Low-friction league & tournament pass
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-cyan-400 shrink-0" />
          </a>
        </div>

        {/* Restore Purchase Section */}
        <form
          onSubmit={handleRestoreSubmit}
          className="mt-5 pt-4 border-t border-slate-800 space-y-2"
        >
          <label
            htmlFor="restore-purchase-input"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span>Restore Purchase</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="restore-purchase-input"
              type="text"
              value={restoreCode}
              onChange={(e) => {
                setRestoreCode(e.target.value);
                if (restoreError) setRestoreError(null);
              }}
              placeholder="Enter unlock code"
              className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs font-mono text-slate-100 placeholder:text-slate-600"
            />
            <button
              type="submit"
              className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              Unlock
            </button>
          </div>
          {restoreError && (
            <p className="text-[11px] text-amber-400">{restoreError}</p>
          )}
        </form>
      </div>
    </div>
  );
};
