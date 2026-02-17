import type { FFmpeg, LogCallback } from './ffmpeg';
import { parseTimeToSeconds } from './ffmpeg';

export { loadFFmpeg, mountFile, unmountFile } from './ffmpeg';

export interface CompressProgress {
  percent: number;
  message: string;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  audioBitrate: number;
}

export interface CompressionPlan {
  videoBitrate: number;
  audioBitrate: number;
  newWidth: number;
  newHeight: number;
  minWidth: number;
  minHeight: number;
  minVideoBitrate: number;
}

const STANDARD_RESOLUTIONS = [
  { label: '1080p', height: 1080 },
  { label: '720p', height: 720 },
  { label: '480p', height: 480 },
  { label: '360p', height: 360 },
  { label: '240p', height: 240 },
  { label: '144p', height: 144 },
];

// Minimum bits per pixel per second for acceptable quality
const MIN_BPP = 0.04;

export async function getVideoInfo(ffmpeg: FFmpeg, inputPath: string): Promise<VideoInfo> {
  let duration = 0;
  let width = 0;
  let height = 0;
  let audioBitrate = 128_000; // default fallback

  const logHandler: LogCallback = ({ message }) => {
    // Duration
    const durMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (durMatch) {
      duration = parseTimeToSeconds(durMatch[0].replace('Duration: ', ''));
    }

    // Video stream resolution
    const resMatch = message.match(/Stream.*Video.*\s(\d{2,5})x(\d{2,5})/);
    if (resMatch) {
      width = parseInt(resMatch[1], 10);
      height = parseInt(resMatch[2], 10);
    }

    // Audio stream bitrate
    const audioMatch = message.match(/Stream.*Audio.*?(\d+)\s*kb\/s/);
    if (audioMatch) {
      audioBitrate = parseInt(audioMatch[1], 10) * 1000;
    }
  };

  ffmpeg.on('log', logHandler);
  await ffmpeg.exec(['-i', inputPath, '-f', 'null', '-t', '0', '-']);
  ffmpeg.off('log', logHandler);

  if (!duration) {
    throw new Error('Could not determine video duration.');
  }
  if (!width || !height) {
    throw new Error('Could not determine video resolution.');
  }

  return { duration, width, height, audioBitrate };
}

export function calculateCompression(
  fileSize: number,
  duration: number,
  width: number,
  height: number,
  targetBytes: number,
): CompressionPlan {
  // Audio budget: copy if possible, otherwise 96kbps
  const baseAudioBitrate = 96_000;
  const totalTargetBits = targetBytes * 8;
  const availableVideoBits = totalTargetBits - (baseAudioBitrate * duration);

  if (availableVideoBits <= 0) {
    throw new Error('Target size is too small even for audio alone.');
  }

  const audioBitrate = baseAudioBitrate;
  const aspect = width / height;

  // Find best resolution: highest where bpp stays above threshold
  let bestWidth = width;
  let bestHeight = height;
  let bestVideoBitrate = availableVideoBits / duration;

  // Check if source resolution works
  const sourceBpp = bestVideoBitrate / (width * height);
  if (sourceBpp < MIN_BPP) {
    // Need to scale down — find the best resolution
    let found = false;
    for (const res of STANDARD_RESOLUTIONS) {
      if (res.height >= height) continue; // skip resolutions >= source
      const h = res.height;
      const w = Math.round(h * aspect / 2) * 2; // ensure even
      const bpp = bestVideoBitrate / (w * h);
      if (bpp >= MIN_BPP) {
        bestWidth = w;
        bestHeight = h;
        found = true;
        break;
      }
    }
    if (!found) {
      // Use 144p as floor
      bestHeight = 144;
      bestWidth = Math.round(144 * aspect / 2) * 2;
    }
  }

  // Calculate minimum quality (144p floor)
  const minHeight = 144;
  const minWidth = Math.round(minHeight * aspect / 2) * 2;
  const minVideoBitrate = availableVideoBits / duration;

  return {
    videoBitrate: Math.round(bestVideoBitrate),
    audioBitrate,
    newWidth: bestWidth,
    newHeight: bestHeight,
    minWidth,
    minHeight,
    minVideoBitrate: Math.round(minVideoBitrate),
  };
}

export async function compressVideo(
  ffmpeg: FFmpeg,
  inputPath: string,
  plan: CompressionPlan,
  duration: number,
  onProgress: (info: CompressProgress) => void,
): Promise<Blob> {
  const videoBitrateK = Math.max(1, Math.round(plan.videoBitrate / 1000));
  const audioBitrateK = Math.round(plan.audioBitrate / 1000);
  const needsScale = plan.newWidth !== 0; // always scale to target

  const scaleFilter = `-vf`;
  const scaleValue = `scale=${plan.newWidth}:${plan.newHeight}`;

  // Pass 1 — analysis
  onProgress({ percent: 0, message: 'Pass 1/2: Analyzing video...' });

  const pass1LogHandler: LogCallback = ({ message }) => {
    const match = message.match(/time=\s*(\d+:\d+:\d+\.\d+)/);
    if (match && duration > 0) {
      const currentTime = parseTimeToSeconds(match[1]);
      const percent = Math.min(Math.round((currentTime / duration) * 45), 45);
      onProgress({ percent, message: `Pass 1/2: Analyzing... ${percent}%` });
    }
  };

  ffmpeg.on('log', pass1LogHandler);
  await ffmpeg.exec([
    '-i', inputPath,
    scaleFilter, scaleValue,
    '-c:v', 'libx264',
    '-b:v', `${videoBitrateK}k`,
    '-pass', '1',
    '-passlogfile', '/tmp/ffmpeg2pass',
    '-an',
    '-f', 'null',
    '-',
  ]);
  ffmpeg.off('log', pass1LogHandler);

  // Pass 2 — encode
  onProgress({ percent: 50, message: 'Pass 2/2: Encoding video...' });

  const pass2LogHandler: LogCallback = ({ message }) => {
    const match = message.match(/time=\s*(\d+:\d+:\d+\.\d+)/);
    if (match && duration > 0) {
      const currentTime = parseTimeToSeconds(match[1]);
      const percent = 50 + Math.min(Math.round((currentTime / duration) * 45), 45);
      onProgress({ percent, message: `Pass 2/2: Encoding... ${percent - 50}%` });
    }
  };

  const outputName = 'compressed_output.mp4';

  ffmpeg.on('log', pass2LogHandler);
  await ffmpeg.exec([
    '-i', inputPath,
    scaleFilter, scaleValue,
    '-c:v', 'libx264',
    '-b:v', `${videoBitrateK}k`,
    '-pass', '2',
    '-passlogfile', '/tmp/ffmpeg2pass',
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    outputName,
  ]);
  ffmpeg.off('log', pass2LogHandler);

  onProgress({ percent: 98, message: 'Reading output file...' });

  const data = await ffmpeg.readFile(outputName) as Uint8Array;
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
  await ffmpeg.deleteFile(outputName);

  // Clean up pass log files
  try {
    await ffmpeg.deleteFile('/tmp/ffmpeg2pass-0.log');
    await ffmpeg.deleteFile('/tmp/ffmpeg2pass-0.log.mbtree');
  } catch {
    // ignore cleanup errors
  }

  return blob;
}
