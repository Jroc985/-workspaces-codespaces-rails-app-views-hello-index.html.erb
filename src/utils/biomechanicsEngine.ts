import type {
  ArmKeypoints,
  CoachingFlag,
  Handedness,
  InputMode,
  LandingResult,
  LiveTelemetry,
  Point2D,
  ThrowPhase,
  ThrowRecord,
} from '../types/biomechanics';

// MediaPipe Pose Landmark Indices
// Right arm: Shoulder 12, Elbow 14, Wrist 16, Index 20
// Left arm: Shoulder 11, Elbow 13, Wrist 15, Index 19
const LANDMARK_INDICES: Record<
  Handedness,
  { shoulder: number; elbow: number; wrist: number; indexFinger: number }
> = {
  right: { shoulder: 12, elbow: 14, wrist: 16, indexFinger: 20 },
  left: { shoulder: 11, elbow: 13, wrist: 15, indexFinger: 19 },
};

export function extractThrowingArmKeypoints(
  landmarks: Point2D[] | null,
  handedness: Handedness
): ArmKeypoints | null {
  if (!landmarks || landmarks.length < 21) return null;
  const idx = LANDMARK_INDICES[handedness];
  const shoulder = landmarks[idx.shoulder];
  const elbow = landmarks[idx.elbow];
  const wrist = landmarks[idx.wrist];
  const indexFinger = landmarks[idx.indexFinger];

  if (!shoulder || !elbow || !wrist || !indexFinger) return null;

  const minVisibility = Math.min(
    shoulder.visibility ?? 1,
    elbow.visibility ?? 1,
    wrist.visibility ?? 1
  );

  if (minVisibility < 0.3) {
    return null;
  }

  return { shoulder, elbow, wrist, indexFinger };
}

export function calculateAngleDeg(a: Point2D, b: Point2D, c: Point2D): number {
  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;

  const dot = abX * cbX + abY * cbY;
  const magAB = Math.hypot(abX, abY);
  const magCB = Math.hypot(cbX, cbY);

  if (magAB === 0 || magCB === 0) return 0;

  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  const radians = Math.acos(cosine);
  return Math.round((radians * 180) / Math.PI);
}

export function generateCoachingFeedback(metrics: {
  minDrawbackAngle: number;
  releaseAngle: number;
  maxExtensionAngle: number;
  elbowDriftPct: number;
  elbowDriftPx: number;
  shoulderSwayPct: number;
  landingResult?: LandingResult | null;
}): { overallStatus: 'optimal' | 'needs_adjustment'; flags: CoachingFlag[] } {
  const flags: CoachingFlag[] = [];
  const {
    minDrawbackAngle,
    releaseAngle,
    maxExtensionAngle,
    elbowDriftPct,
    elbowDriftPx,
    shoulderSwayPct,
    landingResult,
  } = metrics;

  const hasElbowDrop = elbowDriftPct > 3.5 || elbowDriftPx > 18;
  const hasElbowLift = elbowDriftPct < -4.0;
  const hasShortFollow = maxExtensionAngle < 160;
  const hasEarlyRelease = releaseAngle < 135;
  const hasShoulderSway = shoulderSwayPct > 2.2;

  // Smart target-result correlated insights
  if (landingResult === 'LOW' && (hasElbowDrop || elbowDriftPct > 2.0)) {
    flags.push({
      id: 'flag-corr-low-drop',
      code: 'ELBOW_DROP',
      severity: 'warning',
      title: 'Missed Low · Elbow Drop',
      detail: `Your elbow dropped ${Math.abs(elbowDriftPct).toFixed(
        1
      )}% before release, pulling the trajectory down.`,
    });
  } else if (landingResult === 'HIGH' && (hasEarlyRelease || hasShortFollow)) {
    flags.push({
      id: 'flag-corr-high-release',
      code: 'EARLY_RELEASE',
      severity: 'warning',
      title: 'Missed High · Early Release',
      detail: `You released while your forearm was still moving upward (release angle ${Math.round(
        releaseAngle
      )}° < 135°).`,
    });
  } else if (
    (landingResult === 'LEFT' || landingResult === 'RIGHT') &&
    (hasShoulderSway || shoulderSwayPct > 1.5)
  ) {
    flags.push({
      id: 'flag-corr-lateral-sway',
      code: 'SHOULDER_SWAY',
      severity: 'warning',
      title: `Missed ${landingResult === 'LEFT' ? 'Left' : 'Right'} · Shoulder Sway`,
      detail: `Lateral shoulder movement detected (${shoulderSwayPct.toFixed(
        1
      )}%); keep your torso locked.`,
    });
  }

  // Core biomechanical rules (avoid duplicating correlated flags)
  if (hasElbowDrop && !flags.some((f) => f.code === 'ELBOW_DROP')) {
    flags.push({
      id: 'flag-elbow-drop',
      code: 'ELBOW_DROP',
      severity: 'warning',
      title: 'Elbow Drop',
      detail: `Elbow dropped ${elbowDriftPct.toFixed(1)}% (${Math.round(
        elbowDriftPx
      )}px) during acceleration. Keep your upper arm locked as a hinge before release.`,
    });
  } else if (hasElbowLift) {
    flags.push({
      id: 'flag-elbow-lift',
      code: 'ELBOW_LIFT',
      severity: 'warning',
      title: 'Early Elbow Lift',
      detail: `Elbow rose ${Math.abs(elbowDriftPct).toFixed(
        1
      )}% before release. Delay upward follow-through lift until after dart release.`,
    });
  }

  if (hasShortFollow) {
    flags.push({
      id: 'flag-short-follow',
      code: 'SHORT_FOLLOW_THROUGH',
      severity: 'warning',
      title: 'Short Follow-Through',
      detail: `Peak extension stopped at ${Math.round(
        maxExtensionAngle
      )}° (target ≥ 160°). Commit to a full forearm extension straight toward the board.`,
    });
  }

  if (hasShoulderSway && !flags.some((f) => f.code === 'SHOULDER_SWAY')) {
    flags.push({
      id: 'flag-shoulder-sway',
      code: 'SHOULDER_SWAY',
      severity: 'warning',
      title: 'Shoulder Sway',
      detail: `Lateral shoulder movement detected (${shoulderSwayPct.toFixed(
        1
      )}%); keep your torso locked over your front foot.`,
    });
  }

  if (minDrawbackAngle > 92) {
    flags.push({
      id: 'flag-shallow-drawback',
      code: 'SHALLOW_DRAWBACK',
      severity: 'warning',
      title: 'Shallow Drawback',
      detail: `Minimum pullback angle was ${Math.round(
        minDrawbackAngle
      )}°. Compact your pullback near ~65° to build a consistent acceleration lever.`,
    });
  }

  if (flags.length === 0) {
    const targetSuffix =
      landingResult === 'T20'
        ? ' Clean hinge mechanics matched your On Target / T20 hit.'
        : landingResult
        ? ` Mechanics stayed steady on your ${landingResult.toLowerCase()} miss — focus on finger release timing.`
        : '';

    flags.push({
      id: 'flag-optimal',
      code: 'OPTIMAL',
      severity: 'good',
      title: landingResult === 'T20' ? 'Locked In · T20 Mechanics' : 'Optimal Form',
      detail: `Stable elbow hinge (${elbowDriftPct >= 0 ? '+' : ''}${elbowDriftPct.toFixed(
        1
      )}% drift), ${Math.round(maxExtensionAngle)}° follow-through extension.${targetSuffix}`,
    });
    return { overallStatus: 'optimal', flags };
  }

  return { overallStatus: 'needs_adjustment', flags };
}

export const FREE_THROW_LIMIT = 3;

export class ThrowCycleTracker {
  private phase: ThrowPhase = 'READY';
  private smoothedAngle: number | null = null;
  private prevSmoothedAngle: number | null = null;
  private baselineElbowY: number | null = null;
  private baselineShoulderX: number | null = null;
  private minDrawbackAngle = 180;
  private maxExtensionAngle = 0;
  private peakVelocityAngle = 138;
  private maxAngularVelocity = 0;
  private maxDownwardDriftNorm = 0;
  private maxUpwardDriftNorm = 0;
  private maxShoulderSwayNorm = 0;
  private drawbackStartMs = 0;
  private accelStartMs = 0;
  private lastPeakMs = 0;
  private cooldownUntilMs = 0;
  private trajectory: number[] = [];
  private recentAngles: number[] = [];

  public reset(): void {
    this.phase = 'READY';
    this.smoothedAngle = null;
    this.prevSmoothedAngle = null;
    this.baselineElbowY = null;
    this.baselineShoulderX = null;
    this.minDrawbackAngle = 180;
    this.maxExtensionAngle = 0;
    this.peakVelocityAngle = 138;
    this.maxAngularVelocity = 0;
    this.maxDownwardDriftNorm = 0;
    this.maxUpwardDriftNorm = 0;
    this.maxShoulderSwayNorm = 0;
    this.drawbackStartMs = 0;
    this.accelStartMs = 0;
    this.lastPeakMs = 0;
    this.cooldownUntilMs = 0;
    this.trajectory = [];
    this.recentAngles = [];
  }

  public update(
    keypoints: ArmKeypoints | null,
    videoHeightPx: number,
    handedness: Handedness,
    source: InputMode,
    currentThrowCount: number,
    nowMs: number = performance.now()
  ): { telemetry: LiveTelemetry; completedThrow?: ThrowRecord } {
    if (!keypoints) {
      return {
        telemetry: {
          elbowAngle: null,
          elbowDriftPct: 0,
          elbowDriftPx: 0,
          shoulderSwayPct: 0,
          maxExtensionAngle: this.maxExtensionAngle > 0 ? Math.round(this.maxExtensionAngle) : null,
          baselineElbowY: this.baselineElbowY,
          phase: this.phase,
          hasPose: false,
          poseConfidence: 0,
        },
      };
    }

    const rawAngle = calculateAngleDeg(keypoints.shoulder, keypoints.elbow, keypoints.wrist);
    const alpha = 0.45;
    this.prevSmoothedAngle = this.smoothedAngle;
    this.smoothedAngle =
      this.smoothedAngle === null ? rawAngle : this.smoothedAngle * (1 - alpha) + rawAngle * alpha;

    const angle = Math.round(this.smoothedAngle);
    const prevAngle = this.prevSmoothedAngle ?? angle;
    const velocity = angle - prevAngle;

    const confidence = Math.round(
      (((keypoints.shoulder.visibility ?? 0.9) +
        (keypoints.elbow.visibility ?? 0.9) +
        (keypoints.wrist.visibility ?? 0.9)) /
        3) *
        100
    );

    const effectiveHeight = videoHeightPx > 0 ? videoHeightPx : 720;
    const currentDriftNorm =
      this.baselineElbowY !== null ? keypoints.elbow.y - this.baselineElbowY : 0;
    const currentSwayNorm =
      this.baselineShoulderX !== null ? Math.abs(keypoints.shoulder.x - this.baselineShoulderX) : 0;

    let completedThrow: ThrowRecord | undefined;

    if (nowMs < this.cooldownUntilMs) {
      return {
        telemetry: {
          elbowAngle: angle,
          elbowDriftPct: Number((currentDriftNorm * 100).toFixed(1)),
          elbowDriftPx: Math.round(currentDriftNorm * effectiveHeight),
          shoulderSwayPct: Number((currentSwayNorm * 100).toFixed(1)),
          maxExtensionAngle: this.maxExtensionAngle > 0 ? Math.round(this.maxExtensionAngle) : null,
          baselineElbowY: this.baselineElbowY,
          phase: 'READY',
          hasPose: true,
          poseConfidence: confidence,
        },
      };
    }

    this.recentAngles.push(angle);
    if (this.recentAngles.length > 20) {
      this.recentAngles.shift();
    }

    if (this.phase === 'READY') {
      const recentMax = Math.max(...this.recentAngles);
      if (angle < 92 || (angle < 105 && recentMax - angle >= 12 && velocity <= -1)) {
        this.phase = 'DRAWBACK';
        this.baselineElbowY = keypoints.elbow.y;
        this.baselineShoulderX = keypoints.shoulder.x;
        this.minDrawbackAngle = angle;
        this.maxExtensionAngle = angle;
        this.peakVelocityAngle = angle;
        this.maxAngularVelocity = 0;
        this.maxDownwardDriftNorm = 0;
        this.maxUpwardDriftNorm = 0;
        this.maxShoulderSwayNorm = 0;
        this.drawbackStartMs = nowMs;
        this.trajectory = [angle];
      }
    } else if (this.phase === 'DRAWBACK') {
      this.trajectory.push(angle);
      if (angle < this.minDrawbackAngle) {
        this.minDrawbackAngle = angle;
        this.baselineElbowY = keypoints.elbow.y;
        this.baselineShoulderX = keypoints.shoulder.x;
      }

      if (angle - this.minDrawbackAngle >= 12 && velocity >= 1.5) {
        this.phase = 'ACCELERATION';
        this.accelStartMs = nowMs;
        this.maxExtensionAngle = angle;
        this.peakVelocityAngle = angle;
        this.maxAngularVelocity = velocity;
      } else if (nowMs - this.drawbackStartMs > 4000) {
        this.phase = 'READY';
        this.baselineElbowY = null;
        this.baselineShoulderX = null;
      }
    } else if (this.phase === 'ACCELERATION') {
      this.trajectory.push(angle);
      if (angle > this.maxExtensionAngle) {
        this.maxExtensionAngle = angle;
        this.lastPeakMs = nowMs;
      }
      if (velocity >= this.maxAngularVelocity && angle >= 105) {
        this.maxAngularVelocity = velocity;
        this.peakVelocityAngle = angle;
      }

      if (this.baselineElbowY !== null) {
        const diff = keypoints.elbow.y - this.baselineElbowY;
        if (diff > this.maxDownwardDriftNorm) this.maxDownwardDriftNorm = diff;
        if (diff < -this.maxUpwardDriftNorm) this.maxUpwardDriftNorm = -diff;
      }
      if (this.baselineShoulderX !== null) {
        const sway = Math.abs(keypoints.shoulder.x - this.baselineShoulderX);
        if (sway > this.maxShoulderSwayNorm) this.maxShoulderSwayNorm = sway;
      }

      if (angle >= 122 || angle - this.minDrawbackAngle >= 38) {
        this.phase = 'FOLLOW_THROUGH';
        this.lastPeakMs = nowMs;
      } else if (nowMs - this.accelStartMs > 1800) {
        this.phase = 'READY';
        this.baselineElbowY = null;
        this.baselineShoulderX = null;
      }
    } else if (this.phase === 'FOLLOW_THROUGH') {
      this.trajectory.push(angle);
      if (angle > this.maxExtensionAngle) {
        this.maxExtensionAngle = angle;
        this.lastPeakMs = nowMs;
      }

      if (this.baselineElbowY !== null) {
        const diff = keypoints.elbow.y - this.baselineElbowY;
        if (diff > this.maxDownwardDriftNorm) this.maxDownwardDriftNorm = diff;
        if (diff < -this.maxUpwardDriftNorm) this.maxUpwardDriftNorm = -diff;
      }
      if (this.baselineShoulderX !== null) {
        const sway = Math.abs(keypoints.shoulder.x - this.baselineShoulderX);
        if (sway > this.maxShoulderSwayNorm) this.maxShoulderSwayNorm = sway;
      }

      const settledAfterPeak = nowMs - this.lastPeakMs >= 320;
      const beganReturning = this.maxExtensionAngle - angle >= 10 && nowMs - this.lastPeakMs >= 120;

      if (settledAfterPeak || beganReturning) {
        const dominantDriftNorm =
          this.maxDownwardDriftNorm >= this.maxUpwardDriftNorm
            ? this.maxDownwardDriftNorm
            : -this.maxUpwardDriftNorm;

        const elbowDriftPct = Number((dominantDriftNorm * 100).toFixed(1));
        const elbowDriftPx = Math.round(dominantDriftNorm * effectiveHeight);
        const shoulderSwayPct = Number((this.maxShoulderSwayNorm * 100).toFixed(1));
        const releaseDurationMs = Math.max(120, Math.round(this.lastPeakMs - this.accelStartMs));
        const maxExt = Math.round(this.maxExtensionAngle);
        const minDraw = Math.round(this.minDrawbackAngle);
        const releaseAngle = Math.round(this.peakVelocityAngle);

        const coaching = generateCoachingFeedback({
          minDrawbackAngle: minDraw,
          releaseAngle,
          maxExtensionAngle: maxExt,
          elbowDriftPct,
          elbowDriftPx,
          shoulderSwayPct,
        });

        completedThrow = {
          id: `throw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          throwNumber: currentThrowCount + 1,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          handedness,
          source,
          minDrawbackAngle: minDraw,
          releaseAngle,
          maxExtensionAngle: maxExt,
          elbowDriftPct,
          elbowDriftPx,
          shoulderSwayPct,
          releaseDurationMs,
          landingResult: null,
          overallStatus: coaching.overallStatus,
          flags: coaching.flags,
          angleTrajectory: this.trajectory.slice(0, 60),
        };

        this.phase = 'READY';
        this.cooldownUntilMs = nowMs + 650;
      }
    }

    const activeDriftNorm =
      this.phase === 'ACCELERATION' || this.phase === 'FOLLOW_THROUGH'
        ? this.maxDownwardDriftNorm >= this.maxUpwardDriftNorm
          ? this.maxDownwardDriftNorm
          : -this.maxUpwardDriftNorm
        : currentDriftNorm;

    const activeSwayNorm =
      this.phase === 'ACCELERATION' || this.phase === 'FOLLOW_THROUGH'
        ? this.maxShoulderSwayNorm
        : currentSwayNorm;

    return {
      telemetry: {
        elbowAngle: angle,
        elbowDriftPct: Number((activeDriftNorm * 100).toFixed(1)),
        elbowDriftPx: Math.round(activeDriftNorm * effectiveHeight),
        shoulderSwayPct: Number((activeSwayNorm * 100).toFixed(1)),
        maxExtensionAngle: this.maxExtensionAngle > 0 ? Math.round(this.maxExtensionAngle) : null,
        baselineElbowY: this.baselineElbowY,
        phase: this.phase,
        hasPose: true,
        poseConfidence: confidence,
      },
      completedThrow,
    };
  }
}

export function createSampleThrowRecord(
  throwNumber: number,
  handedness: Handedness,
  source: InputMode
): ThrowRecord {
  const presets = [
    {
      minDrawbackAngle: 64,
      releaseAngle: 142,
      maxExtensionAngle: 172,
      elbowDriftPct: 1.2,
      elbowDriftPx: 9,
      shoulderSwayPct: 0.9,
      releaseDurationMs: 205,
      angleTrajectory: [108, 94, 78, 68, 64, 71, 92, 122, 148, 166, 172, 171, 166],
    },
    {
      minDrawbackAngle: 72,
      releaseAngle: 129,
      maxExtensionAngle: 148,
      elbowDriftPct: 4.8,
      elbowDriftPx: 34,
      shoulderSwayPct: 1.4,
      releaseDurationMs: 265,
      angleTrajectory: [112, 98, 84, 74, 72, 79, 96, 118, 134, 144, 148, 143, 136],
    },
    {
      minDrawbackAngle: 67,
      releaseAngle: 132,
      maxExtensionAngle: 162,
      elbowDriftPct: 1.9,
      elbowDriftPx: 14,
      shoulderSwayPct: 3.1,
      releaseDurationMs: 195,
      angleTrajectory: [110, 95, 80, 70, 67, 76, 98, 128, 150, 160, 162, 161, 157],
    },
  ];

  const preset = presets[(throwNumber - 1) % presets.length];
  const coaching = generateCoachingFeedback({
    minDrawbackAngle: preset.minDrawbackAngle,
    releaseAngle: preset.releaseAngle,
    maxExtensionAngle: preset.maxExtensionAngle,
    elbowDriftPct: preset.elbowDriftPct,
    elbowDriftPx: preset.elbowDriftPx,
    shoulderSwayPct: preset.shoulderSwayPct,
  });

  return {
    id: `sample-${Date.now()}-${throwNumber}`,
    throwNumber,
    timestamp: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    handedness,
    source,
    ...preset,
    landingResult: null,
    overallStatus: coaching.overallStatus,
    flags: coaching.flags,
  };
}
