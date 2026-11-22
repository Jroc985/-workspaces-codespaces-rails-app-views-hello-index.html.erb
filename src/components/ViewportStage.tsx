import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Upload,
  SwitchCamera,
  Play,
  Pause,
  Eye,
  EyeOff,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Video,
  Layers,
  Lock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  ArmKeypoints,
  CameraFacing,
  Handedness,
  InputMode,
  LiveTelemetry,
  PlaybackSpeed,
  Point2D,
  ThrowPhase,
  ThrowRecord,
} from '../types/biomechanics';
import { getPoseLandmarker, detectPoseSafe, type PoseLandmarkerInstance } from '../utils/mediapipePose';
import { extractThrowingArmKeypoints, ThrowCycleTracker } from '../utils/biomechanicsEngine';
import { drawSkeletonOverlay } from '../utils/canvasRenderer';

interface ViewportStageProps {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  handedness: Handedness;
  onHandednessChange: (hand: Handedness) => void;
  onTelemetryUpdate: (telemetry: LiveTelemetry) => void;
  onThrowDetected: (record: ThrowRecord) => void;
  currentThrowCount: number;
  isPro: boolean;
  showProGhost: boolean;
  onToggleProGhost: () => void;
  onTriggerSampleThrow: () => void;
}

const PHASE_LABELS: Record<ThrowPhase, string> = {
  READY: 'Ready / Aiming',
  DRAWBACK: 'Drawback',
  ACCELERATION: 'Forward Acceleration',
  FOLLOW_THROUGH: 'Follow-Through',
};

const FRAME_STEP_SECONDS = 1 / 30;

export const ViewportStage: React.FC<ViewportStageProps> = ({
  inputMode,
  onInputModeChange,
  handedness,
  onHandednessChange,
  onTelemetryUpdate,
  onThrowDetected,
  currentThrowCount,
  isPro,
  showProGhost,
  onToggleProGhost,
  onTriggerSampleThrow,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInstance | null>(null);
  const trackerRef = useRef<ThrowCycleTracker>(new ThrowCycleTracker());
  const wristTrailRef = useRef<Point2D[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const handednessRef = useRef(handedness);
  handednessRef.current = handedness;
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
  const throwCountRef = useRef(currentThrowCount);
  throwCountRef.current = currentThrowCount;
  const onTelemetryRef = useRef(onTelemetryUpdate);
  onTelemetryRef.current = onTelemetryUpdate;
  const onThrowRef = useRef(onThrowDetected);
  onThrowRef.current = onThrowDetected;
  const showProGhostRef = useRef(showProGhost && isPro);
  showProGhostRef.current = showProGhost && isPro;

  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const showSkeletonRef = useRef(showSkeleton);
  showSkeletonRef.current = showSkeleton;

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(0.5);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [livePhase, setLivePhase] = useState<ThrowPhase>('READY');
  const [hasPose, setHasPose] = useState(false);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current && inputModeRef.current === 'camera') {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const ensurePoseModel = useCallback(async () => {
    if (landmarkerRef.current) {
      setModelStatus('ready');
      return landmarkerRef.current;
    }
    setModelStatus('loading');
    setModelError(null);
    try {
      const instance = await getPoseLandmarker();
      landmarkerRef.current = instance;
      setModelStatus('ready');
      return instance;
    } catch (err) {
      setModelStatus('error');
      setModelError(
        err instanceof Error
          ? err.message
          : 'Unable to initialize MediaPipe Pose Landmarker from CDN.'
      );
      return null;
    }
  }, []);

  const startCamera = useCallback(
    async (facing: CameraFacing) => {
      setCameraError(null);
      stopCameraStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported in this browser environment.');
        return;
      }

      try {
        await ensurePoseModel();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        trackerRef.current.reset();
        wristTrailRef.current = [];
        setCameraActive(true);
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access or switch to Upload Throw Video.'
            : 'No live camera detected or stream failed to start. Switch to Upload Throw Video to analyze clips.';
        setCameraError(message);
        setCameraActive(false);
      }
    },
    [ensurePoseModel, stopCameraStream]
  );

  // Switch cleanly between Live Camera and Upload Throw Video
  useEffect(() => {
    if (inputMode === 'video') {
      stopCameraStream();
      trackerRef.current.reset();
      wristTrailRef.current = [];
      lastVideoTimeRef.current = -1;
      if (videoRef.current && videoUrl && !videoRef.current.src) {
        videoRef.current.srcObject = null;
        videoRef.current.src = videoUrl;
        videoRef.current.playbackRate = playbackSpeed;
      }
    } else if (inputMode === 'camera') {
      if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, stopCameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [stopCameraStream, videoUrl]);

  // Continuous inference & skeleton overlay loop
  useEffect(() => {
    let active = true;

    const processFrame = () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      const shouldMirror = inputModeRef.current === 'camera' && cameraFacing === 'user';

      const isPlayingFrame =
        video && video.readyState >= 2 && !video.paused && !video.ended;
      const isScrubbedVideoFrame =
        video &&
        inputModeRef.current === 'video' &&
        video.readyState >= 2 &&
        Math.abs(video.currentTime - lastVideoTimeRef.current) > 0.001;

      if (video && canvas && landmarker && (isPlayingFrame || isScrubbedVideoFrame)) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const landmarks = detectPoseSafe(landmarker, video);
          const keypoints: ArmKeypoints | null = extractThrowingArmKeypoints(
            landmarks,
            handednessRef.current
          );

          if (keypoints) {
            wristTrailRef.current.push(keypoints.wrist);
            if (wristTrailRef.current.length > 22) {
              wristTrailRef.current.shift();
            }
          } else {
            wristTrailRef.current = [];
          }

          const { telemetry, completedThrow } = trackerRef.current.update(
            keypoints,
            video.videoHeight || 720,
            handednessRef.current,
            inputModeRef.current,
            throwCountRef.current
          );

          setLivePhase(telemetry.phase);
          setHasPose(telemetry.hasPose);
          onTelemetryRef.current(telemetry);

          drawSkeletonOverlay({
            canvas,
            video,
            keypoints,
            telemetry,
            wristTrail: wristTrailRef.current,
            mirrorX: shouldMirror,
            showSkeleton: showSkeletonRef.current,
            showProGhost: showProGhostRef.current,
          });

          if (completedThrow) {
            onThrowRef.current(completedThrow);
          }
        } catch {
          // Skip transient frame errors without halting inference loop
        }
      }

      rafRef.current = requestAnimationFrame(processFrame);
    };

    rafRef.current = requestAnimationFrame(processFrame);
    return () => {
      active = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cameraFacing]);

  useEffect(() => {
    if (videoRef.current && inputMode === 'video') {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, inputMode, videoUrl]);

  const handleFlipCamera = () => {
    const nextFacing: CameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (cameraActive) {
      void startCamera(nextFacing);
    }
  };

  const handleVideoFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setVideoName(file.name);
    setVideoProgress(0);
    lastVideoTimeRef.current = -1;
    trackerRef.current.reset();
    wristTrailRef.current = [];

    await ensurePoseModel();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = nextUrl;
      videoRef.current.playbackRate = playbackSpeed;
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const toggleVideoPlay = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    await ensurePoseModel();
    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        trackerRef.current.reset();
        wristTrailRef.current = [];
      }
      video.playbackRate = playbackSpeed;
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = parseFloat(e.target.value);
    video.currentTime = nextTime;
    setVideoProgress(nextTime);
    trackerRef.current.reset();
    wristTrailRef.current = [];
  };

  const handleStepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (!video.paused) {
      video.pause();
      setIsPlaying(false);
    }
    const nextTime = Math.max(
      0,
      Math.min(video.duration || 0, video.currentTime + direction * FRAME_STEP_SECONDS)
    );
    video.currentTime = nextTime;
    setVideoProgress(nextTime);
  };

  const handleResetTracker = () => {
    trackerRef.current.reset();
    wristTrailRef.current = [];
    setLivePhase('READY');
  };

  const isMirroredCamera = inputMode === 'camera' && cameraFacing === 'user';
  const ghostActive = isPro && showProGhost;

  return (
    <section aria-label="Biomechanical Vision Stage" className="flex flex-col gap-3">
      {/* Mode & Handedness Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Video Input Mode"
          className="inline-flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'camera'}
            onClick={() => onInputModeChange('camera')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inputMode === 'camera'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>Live Camera</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'video'}
            onClick={() => onInputModeChange('video')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              inputMode === 'video'
                ? 'bg-emerald-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4 shrink-0" />
            <span>Upload Throw Video</span>
          </button>
        </div>

        <div
          role="group"
          aria-label="Throwing Hand"
          className="inline-flex items-center rounded-xl bg-slate-900 p-1 border border-slate-800"
        >
          <button
            type="button"
            onClick={() => onHandednessChange('right')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              handedness === 'right'
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Right-Handed
          </button>
          <button
            type="button"
            onClick={() => onHandednessChange('left')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              handedness === 'left'
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Left-Handed
          </button>
        </div>
      </div>

      {/* Main Video + Neon Canvas Viewport (iOS Safari playsInline autoPlay muted) */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          loop={inputMode === 'video'}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setVideoProgress(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setVideoDuration(videoRef.current.duration || 0);
              videoRef.current.playbackRate = playbackSpeed;
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className={`w-full h-full object-contain bg-slate-950 ${
            isMirroredCamera ? '-scale-x-100' : ''
          }`}
        />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Top Contrast Scrim & Live Phase Indicator */}
        <div className="absolute top-0 inset-x-0 px-3.5 py-2.5 bg-gradient-to-b from-slate-950/85 via-slate-950/45 to-transparent flex items-center justify-between gap-3 pointer-events-none">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200 min-w-0">
            <span className="font-mono uppercase tracking-wider text-[11px] text-emerald-400 whitespace-nowrap">
              {PHASE_LABELS[livePhase]}
            </span>
            <span className="text-slate-500" aria-hidden="true">
              ·
            </span>
            <span className="text-slate-300 truncate">
              {hasPose
                ? `${handedness === 'right' ? 'Right' : 'Left'} arm locked`
                : 'Awaiting side profile'}
            </span>
            {ghostActive && (
              <>
                <span className="text-slate-500 hidden sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="text-cyan-400 hidden sm:inline whitespace-nowrap">
                  Pro Ghost
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 whitespace-nowrap shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>On-Device</span>
          </div>
        </div>

        {/* MediaPipe Loading Overlay */}
        {modelStatus === 'loading' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 text-center z-20">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-slate-100">
              Loading MediaPipe Pose Landmarker
            </p>
            <p className="text-xs text-slate-400 max-w-xs">
              Initializing client-side vision runtime. Video stays 100% on your device.
            </p>
          </div>
        )}

        {/* Model Error State */}
        {modelStatus === 'error' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-6 text-center z-20">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm font-semibold text-slate-100">Pose Engine Unavailable</p>
            <p className="text-xs text-slate-400 max-w-sm">{modelError}</p>
            <button
              type="button"
              onClick={() => void ensurePoseModel()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer"
            >
              Retry Initialization
            </button>
          </div>
        )}

        {/* Empty / Start Prompt State for Live Camera */}
        {inputMode === 'camera' && !cameraActive && modelStatus !== 'loading' && (
          <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-4 p-6 text-center z-10">
            {cameraError ? (
              <>
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-slate-100">Camera Unavailable</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startCamera(cameraFacing)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
                  >
                    Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => onInputModeChange('video')}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 cursor-pointer"
                  >
                    Upload Throw Video
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h2 className="text-base font-semibold text-slate-100">
                    Position Camera in Side Profile
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Frame your {handedness}-hand shoulder, elbow, wrist, and release hand from 1.5–2m away.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void startCamera(cameraFacing)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Start Live Analysis
                  </button>
                  <button
                    type="button"
                    onClick={onTriggerSampleThrow}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Simulate Sample Throw
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty / Upload Prompt State for Video Upload */}
        {inputMode === 'video' && !videoUrl && modelStatus !== 'loading' && (
          <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-4 p-6 text-center z-10">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
              <Video className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-base font-semibold text-slate-100">
                Upload a Throw Clip (MP4, MOV, WebM)
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Analyze at 0.25x or 0.5x slow motion and scrub frame-by-frame. Clips never leave your browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Choose Video File
              </button>
              <button
                type="button"
                onClick={onTriggerSampleThrow}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Simulate Sample Throw
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoFileSelected}
        className="hidden"
        aria-label="Upload throw video file"
      />

      {/* Bottom Viewport Control Bar */}
      <div className="flex flex-col gap-2.5 bg-slate-900 border border-slate-800 rounded-xl p-2.5">
        {inputMode === 'video' && videoUrl && (
          <div className="flex items-center gap-2.5 px-1">
            <span className="font-mono text-[11px] text-slate-400 tabular-nums w-10">
              {videoProgress.toFixed(2)}s
            </span>
            <input
              type="range"
              min={0}
              max={videoDuration || 1}
              step={0.01}
              value={videoProgress}
              onChange={handleScrub}
              aria-label="Frame-by-frame video scrubber"
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <span className="font-mono text-[11px] text-slate-400 tabular-nums w-10 text-right">
              {videoDuration.toFixed(2)}s
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left Primary Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {inputMode === 'camera' ? (
              <>
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    Pause Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera(cameraFacing)}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Start Camera
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <SwitchCamera className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Flip Camera</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!videoUrl}
                  onClick={() => void toggleVideoPlay()}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                {videoUrl && (
                  <div className="inline-flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleStepFrame(-1)}
                      aria-label="Previous frame"
                      title="Step back 1 frame"
                      className="min-h-[36px] min-w-[36px] px-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-1.5 text-[11px] font-mono text-slate-400">Frame</span>
                    <button
                      type="button"
                      onClick={() => handleStepFrame(1)}
                      aria-label="Next frame"
                      title="Step forward 1 frame"
                      className="min-h-[36px] min-w-[36px] px-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer whitespace-nowrap truncate max-w-[125px]"
                >
                  {videoName ? 'Change Clip' : 'Select Video'}
                </button>
              </>
            )}
          </div>

          {/* Right Overlay & Speed Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {inputMode === 'video' && (
              <div
                role="group"
                aria-label="Playback Speed"
                className="inline-flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800"
              >
                {([0.25, 0.5, 1] as PlaybackSpeed[]).map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`min-h-[36px] px-2 py-1 rounded-md font-mono text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      playbackSpeed === speed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}

            {/* Pro Ghost Overlay Button */}
            <button
              type="button"
              onClick={onToggleProGhost}
              aria-pressed={ghostActive}
              className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap border ${
                ghostActive
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isPro ? (
                <Layers className={`w-4 h-4 ${ghostActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              ) : (
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Pro Ghost Overlay</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSkeleton((s) => !s)}
              aria-pressed={showSkeleton}
              title="Toggle user skeleton overlay"
              className="min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
            >
              {showSkeleton ? (
                <Eye className="w-4 h-4 text-emerald-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {inputMode === 'camera' && (
              <button
                type="button"
                onClick={handleResetTracker}
                title="Reset throw cycle detector"
                className="min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
