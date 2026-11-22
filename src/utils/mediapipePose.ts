import type { Point2D } from '../types/biomechanics';

export interface PoseLandmarkerResultLike {
  landmarks?: Point2D[][];
}

export interface PoseLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResultLike;
  close(): void;
}

interface VisionModule {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      options: {
        baseOptions: {
          modelAssetPath: string;
          delegate?: 'GPU' | 'CPU';
        };
        runningMode: 'VIDEO';
        numPoses: number;
        minPoseDetectionConfidence: number;
        minPosePresenceConfidence: number;
        minTrackingConfidence: number;
      }
    ): Promise<PoseLandmarkerInstance>;
  };
}

const MEDIAPIPE_VERSION = '0.10.18';
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let cachedLandmarkerPromise: Promise<PoseLandmarkerInstance> | null = null;
let lastMonotonicTimestamp = 0;

async function loadVisionModule(): Promise<VisionModule> {
  // Load Google MediaPipe Tasks Vision strictly from CDN in the browser
  const mod = (await import(/* @vite-ignore */ VISION_BUNDLE_URL)) as VisionModule;
  if (!mod?.FilesetResolver || !mod?.PoseLandmarker) {
    throw new Error('MediaPipe Vision bundle loaded without PoseLandmarker exports.');
  }
  return mod;
}

export async function getPoseLandmarker(): Promise<PoseLandmarkerInstance> {
  if (cachedLandmarkerPromise) {
    return cachedLandmarkerPromise;
  }

  cachedLandmarkerPromise = (async () => {
    const { FilesetResolver, PoseLandmarker } = await loadVisionModule();
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    } catch {
      // Fallback cleanly to CPU delegate if WebGL/GPU initialization is unavailable
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
    }
  })().catch((err) => {
    cachedLandmarkerPromise = null;
    throw err;
  });

  return cachedLandmarkerPromise;
}

export function detectPoseSafe(
  landmarker: PoseLandmarkerInstance,
  video: HTMLVideoElement
): Point2D[] | null {
  if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const now = performance.now();
  const timestampMs = now > lastMonotonicTimestamp ? now : lastMonotonicTimestamp + 1;
  lastMonotonicTimestamp = timestampMs;

  const result = landmarker.detectForVideo(video, timestampMs);
  if (result?.landmarks && result.landmarks.length > 0) {
    return result.landmarks[0];
  }
  return null;
}
