import type { ArmKeypoints, LiveTelemetry, Point2D } from '../types/biomechanics';

interface RenderRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function getContainedVideoRect(
  canvasWidth: number,
  canvasHeight: number,
  videoWidth: number,
  videoHeight: number
): RenderRect {
  if (!videoWidth || !videoHeight) {
    return { offsetX: 0, offsetY: 0, width: canvasWidth, height: canvasHeight };
  }

  const videoAspect = videoWidth / videoHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  if (videoAspect > canvasAspect) {
    const width = canvasWidth;
    const height = canvasWidth / videoAspect;
    return {
      offsetX: 0,
      offsetY: (canvasHeight - height) / 2,
      width,
      height,
    };
  }

  const height = canvasHeight;
  const width = canvasHeight * videoAspect;
  return {
    offsetX: (canvasWidth - width) / 2,
    offsetY: 0,
    width,
    height,
  };
}

function toCanvasPoint(
  point: Point2D,
  rect: RenderRect,
  mirrorX: boolean
): { x: number; y: number } {
  const normX = mirrorX ? 1 - point.x : point.x;
  return {
    x: rect.offsetX + normX * rect.width,
    y: rect.offsetY + point.y * rect.height,
  };
}

function drawProGhostReference(params: {
  ctx: CanvasRenderingContext2D;
  shoulder: { x: number; y: number };
  elbow: { x: number; y: number };
  wrist: { x: number; y: number };
  baselineElbowY: number | null;
  rect: RenderRect;
}): void {
  const { ctx, shoulder, elbow, wrist, baselineElbowY, rect } = params;

  // Compute user's anatomical forearm length in canvas pixels
  const forearmLen = Math.max(48, Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y));

  // Stationary Pro Ghost Elbow Anchor (locked at baseline Y when throwing, or current elbow Y)
  const ghostElbow = {
    x: elbow.x,
    y: baselineElbowY !== null ? rect.offsetY + baselineElbowY * rect.height : elbow.y,
  };

  // Vector from ghostElbow back toward shoulder defines the upper-arm axis
  const toShoulderAngle = Math.atan2(shoulder.y - ghostElbow.y, shoulder.x - ghostElbow.x);
  // Determine forward throwing direction (away from shoulder horizontally)
  const throwDir = shoulder.x <= ghostElbow.x ? 1 : -1;

  // Ideal 65-degree drawback forearm angle & 172-degree follow-through extension angle
  const drawbackRad = toShoulderAngle - throwDir * ((65 * Math.PI) / 180);
  const followThroughRad = toShoulderAngle - throwDir * ((172 * Math.PI) / 180);

  const ghostDrawbackWrist = {
    x: ghostElbow.x + Math.cos(drawbackRad) * forearmLen,
    y: ghostElbow.y + Math.sin(drawbackRad) * forearmLen,
  };

  const ghostFollowWrist = {
    x: ghostElbow.x + Math.cos(followThroughRad) * forearmLen,
    y: ghostElbow.y + Math.sin(followThroughRad) * forearmLen,
  };

  ctx.save();

  // 1. Zero-Drop Stationary Elbow Anchor Horizontal Rail
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ghostElbow.x - 68, ghostElbow.y);
  ctx.lineTo(ghostElbow.x + 68, ghostElbow.y);
  ctx.stroke();

  // 2. Ideal Forearm Sweep Arc (65° drawback -> 172° follow-through)
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    ghostElbow.x,
    ghostElbow.y,
    forearmLen,
    drawbackRad,
    followThroughRad,
    throwDir > 0
  );
  ctx.stroke();

  // 3. Cyan Ghost Upper Arm + Ideal Drawback (~65°) + Ideal Follow-Through (172°) Rays
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.72)';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 4]);
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(ghostElbow.x, ghostElbow.y);
  ctx.lineTo(ghostDrawbackWrist.x, ghostDrawbackWrist.y);
  ctx.moveTo(ghostElbow.x, ghostElbow.y);
  ctx.lineTo(ghostFollowWrist.x, ghostFollowWrist.y);
  ctx.stroke();

  // 4. Ghost Anchor Nodes & Labels
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
  [ghostElbow, ghostDrawbackWrist, ghostFollowWrist].forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, idx === 0 ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(103, 232, 249, 0.95)';
  ctx.fillText('65°', ghostDrawbackWrist.x + 6, ghostDrawbackWrist.y - 4);
  ctx.fillText('172°', ghostFollowWrist.x + 6, ghostFollowWrist.y - 4);

  ctx.restore();
}

export function drawSkeletonOverlay(params: {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  keypoints: ArmKeypoints | null;
  telemetry: LiveTelemetry;
  wristTrail: Point2D[];
  mirrorX: boolean;
  showSkeleton: boolean;
  showProGhost: boolean;
}): void {
  const {
    canvas,
    video,
    keypoints,
    telemetry,
    wristTrail,
    mirrorX,
    showSkeleton,
    showProGhost,
  } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  if (displayWidth === 0 || displayHeight === 0) return;

  if (
    canvas.width !== Math.round(displayWidth * dpr) ||
    canvas.height !== Math.round(displayHeight * dpr)
  ) {
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  if ((!showSkeleton && !showProGhost) || !keypoints) {
    ctx.restore();
    return;
  }

  const rect = getContainedVideoRect(
    displayWidth,
    displayHeight,
    video.videoWidth,
    video.videoHeight
  );

  const shoulder = toCanvasPoint(keypoints.shoulder, rect, mirrorX);
  const elbow = toCanvasPoint(keypoints.elbow, rect, mirrorX);
  const wrist = toCanvasPoint(keypoints.wrist, rect, mirrorX);
  const indexFinger = toCanvasPoint(keypoints.indexFinger, rect, mirrorX);

  // Render Cyan Pro Ghost Reference Overlay beneath user skeleton
  if (showProGhost) {
    drawProGhostReference({
      ctx,
      shoulder,
      elbow,
      wrist,
      baselineElbowY: telemetry.baselineElbowY,
      rect,
    });
  }

  if (!showSkeleton) {
    ctx.restore();
    return;
  }

  const hasDriftWarning = Math.abs(telemetry.elbowDriftPct) > 3.5;
  const primaryNeon = hasDriftWarning ? '#F59E0B' : '#22C55E';
  const glowColor = hasDriftWarning ? 'rgba(245, 158, 11, 0.55)' : 'rgba(34, 197, 94, 0.55)';

  // 1. Draw baseline elbow stability reference line when active in a throw cycle
  if (telemetry.baselineElbowY !== null && telemetry.phase !== 'READY') {
    const baseY = rect.offsetY + telemetry.baselineElbowY * rect.height;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = hasDriftWarning ? 'rgba(245, 158, 11, 0.7)' : 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.max(rect.offsetX + 12, elbow.x - 85), baseY);
    ctx.lineTo(Math.min(rect.offsetX + rect.width - 12, elbow.x + 85), baseY);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw wrist release trajectory trail
  if (wristTrail.length > 1) {
    ctx.save();
    ctx.beginPath();
    wristTrail.forEach((pt, i) => {
      const p = toCanvasPoint(pt, rect, mirrorX);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw high-contrast electric green user arm skeleton segments
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = primaryNeon;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.lineTo(indexFinger.x, indexFinger.y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#ECFDF5';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.lineTo(indexFinger.x, indexFinger.y);
  ctx.stroke();
  ctx.restore();

  // 4. Draw elbow angle arc & readout badge
  if (telemetry.elbowAngle !== null) {
    const startAngle = Math.atan2(shoulder.y - elbow.y, shoulder.x - elbow.x);
    const endAngle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
    let diff = endAngle - startAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    ctx.save();
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, 26, startAngle, startAngle + diff, diff < 0);
    ctx.strokeStyle = primaryNeon;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const labelText = `${telemetry.elbowAngle}°`;
    ctx.save();
    ctx.font = '600 13px "JetBrains Mono", monospace';
    const textWidth = ctx.measureText(labelText).width;
    const badgeW = textWidth + 14;
    const badgeH = 24;
    const badgeX = Math.min(displayWidth - badgeW - 8, Math.max(8, elbow.x + 14));
    const badgeY = Math.min(displayHeight - badgeH - 8, Math.max(8, elbow.y + 10));

    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.strokeStyle = primaryNeon;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F8FAFC';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, badgeX + 7, badgeY + badgeH / 2 + 0.5);
    ctx.restore();
  }

  // 5. Draw joint nodes
  const joints = [
    { pt: shoulder, radius: 6 },
    { pt: elbow, radius: 7.5 },
    { pt: wrist, radius: 6 },
    { pt: indexFinger, radius: 5 },
  ];

  joints.forEach(({ pt, radius }) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = primaryNeon;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}
