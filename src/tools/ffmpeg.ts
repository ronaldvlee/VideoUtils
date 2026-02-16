import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

type LogCallback = (event: { type: string; message: string }) => void;

let ffmpeg: FFmpeg | null = null;

const MOUNT_DIR = '/work';
const CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

export type { FFmpeg };
export type { LogCallback };

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[ffmpeg]', message);
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

/**
 * Mount the source file using WORKERFS so FFmpeg can read it on-demand
 * without loading the entire file into WASM memory. This is critical
 * for multi-GB files.
 */
export function mountFile(ffmpeg: FFmpeg, file: File): string {
  ffmpeg.createDir(MOUNT_DIR);
  // @ts-expect-error - FFmpeg types use enum but accepts string at runtime
  ffmpeg.mount('WORKERFS', { files: [file] }, MOUNT_DIR);
  return `${MOUNT_DIR}/${file.name}`;
}

export function unmountFile(ffmpeg: FFmpeg): void {
  try {
    ffmpeg.unmount(MOUNT_DIR);
    ffmpeg.deleteDir(MOUNT_DIR);
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Parse a time= timestamp (HH:MM:SS.cc) from FFmpeg log output into seconds.
 */
export function parseTimeToSeconds(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return 0;
  return (
    parseInt(match[1], 10) * 3600 +
    parseInt(match[2], 10) * 60 +
    parseInt(match[3], 10) +
    parseInt(match[4], 10) / 100
  );
}
