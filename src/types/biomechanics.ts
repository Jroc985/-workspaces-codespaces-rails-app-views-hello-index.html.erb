export type Handedness = 'right' | 'left';
export type InputMode = 'camera' | 'video';
export type CameraFacing = 'environment' | 'user';
export type PlaybackSpeed = 0.25 | 0.5 | 1;

export type ThrowPhase = 'READY' | 'DRAWBACK' | 'ACCELERATION' | 'FOLLOW_THROUGH';

export type LandingResult = 'T20' | 'HIGH' | 'LOW' | 'LEFT' | 'RIGHT';

export interface Point2D {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface ArmKeypoints {
  shoulder: Point2D;
  elbow: Point2D;
  wrist: Point2D;
  indexFinger: Point2D;
}

export interface LiveTelemetry {
  elbowAngle: number | null;
  elbowDriftPct: number;
  elbowDriftPx: number;
  shoulderSwayPct: number;
  maxExtensionAngle: number | null;
  baselineElbowY: number | null;
  phase: ThrowPhase;
  hasPose: boolean;
  poseConfidence: number;
}

export type CoachingCode =
  | 'ELBOW_DROP'
  | 'SHORT_FOLLOW_THROUGH'
  | 'SHALLOW_DRAWBACK'
  | 'ELBOW_LIFT'
  | 'EARLY_RELEASE'
  | 'SHOULDER_SWAY'
  | 'OPTIMAL';

export interface CoachingFlag {
  id: string;
  code: CoachingCode;
  severity: 'good' | 'warning';
  title: string;
  detail: string;
}

export interface ThrowRecord {
  id: string;
  throwNumber: number;
  timestamp: string;
  handedness: Handedness;
  source: InputMode;
  minDrawbackAngle: number;
  releaseAngle: number;
  maxExtensionAngle: number;
  elbowDriftPct: number;
  elbowDriftPx: number;
  shoulderSwayPct: number;
  releaseDurationMs: number;
  landingResult: LandingResult | null;
  overallStatus: 'optimal' | 'needs_adjustment';
  flags: CoachingFlag[];
  angleTrajectory: number[];
}

export type UpgradeTriggerReason =
  | 'throw_limit'
  | 'pro_ghost'
  | 'compare_throws'
  | 'header_cta';
