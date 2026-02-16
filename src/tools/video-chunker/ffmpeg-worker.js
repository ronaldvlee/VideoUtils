import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;

const MOUNT_DIR = '/work';

export async function loadFFmpeg() {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[ffmpeg]', message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

/**
 * Mount the source file using WORKERFS so FFmpeg can read it on-demand
 * without loading the entire file into WASM memory. This is critical
 * for multi-GB files.
 */
export function mountFile(ffmpeg, file) {
  // Create mount point
  ffmpeg.createDir(MOUNT_DIR);
  ffmpeg.mount('WORKERFS', { files: [file] }, MOUNT_DIR);
  return `${MOUNT_DIR}/${file.name}`;
}

export function unmountFile(ffmpeg) {
  try {
    ffmpeg.unmount(MOUNT_DIR);
    ffmpeg.deleteDir(MOUNT_DIR);
  } catch {
    // ignore cleanup errors
  }
}

export async function getVideoDuration(ffmpeg, inputPath) {
  let durationStr = '';
  const logHandler = ({ message }) => {
    const match = message.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      durationStr = match[0];
    }
  };

  ffmpeg.on('log', logHandler);

  // Run a quick probe by asking FFmpeg to process zero frames
  await ffmpeg.exec(['-i', inputPath, '-f', 'null', '-t', '0', '-']);

  ffmpeg.off('log', logHandler);

  if (!durationStr) {
    throw new Error('Could not determine video duration.');
  }

  const match = durationStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const centiseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

/**
 * Parse a time= timestamp from FFmpeg log output into seconds.
 */
function parseTimeToSeconds(timeStr) {
  const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) return 0;
  return (
    parseInt(match[1], 10) * 3600 +
    parseInt(match[2], 10) * 60 +
    parseInt(match[3], 10) +
    parseInt(match[4], 10) / 100
  );
}

export async function splitVideo(ffmpeg, inputPath, fileName, fileSize, duration, maxChunkBytes, onProgress) {
  const avgBitrate = fileSize / duration; // bytes per second
  const estimatedChunkDuration = (maxChunkBytes * 0.95) / avgBitrate;
  const estimatedTotalChunks = Math.ceil(duration / estimatedChunkDuration);

  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.mp4';
  const baseName = fileName.includes('.')
    ? fileName.substring(0, fileName.lastIndexOf('.'))
    : fileName;

  const chunks = [];
  let currentTime = 0;
  let chunkIndex = 0;

  while (currentTime < duration - 0.1) {
    chunkIndex++;
    const chunkName = `${baseName}_part${String(chunkIndex).padStart(3, '0')}${ext}`;

    onProgress({
      current: chunkIndex,
      total: Math.max(estimatedTotalChunks, chunkIndex),
      message: `Splitting chunk ${chunkIndex} of ~${estimatedTotalChunks}...`,
      percent: Math.round((currentTime / duration) * 100),
    });

    // Track the last time= value FFmpeg reports to know where this chunk actually ended
    let lastTime = 0;
    const timeHandler = ({ message }) => {
      const match = message.match(/time=\s*(\d+:\d+:\d+\.\d+)/);
      if (match) {
        lastTime = parseTimeToSeconds(match[1]);
      }
    };
    ffmpeg.on('log', timeHandler);

    // -fs enforces a hard byte-size limit: FFmpeg stops writing once
    // the output file reaches this size, regardless of VBR spikes.
    await ffmpeg.exec([
      '-ss', String(currentTime),
      '-i', inputPath,
      '-t', String(estimatedChunkDuration),
      '-fs', String(maxChunkBytes),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      chunkName,
    ]);

    ffmpeg.off('log', timeHandler);

    const data = await ffmpeg.readFile(chunkName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    chunks.push({ name: chunkName, blob, size: blob.size });

    // Clean up this chunk from virtual FS to save memory
    await ffmpeg.deleteFile(chunkName);

    // Advance by the actual duration FFmpeg wrote (from time= log),
    // not the estimated duration — this handles VBR correctly.
    // If -fs kicked in early, lastTime will be shorter than estimated.
    const actualChunkDuration = lastTime > 0 ? lastTime : estimatedChunkDuration;
    currentTime += actualChunkDuration;
  }

  onProgress({
    current: chunkIndex,
    total: chunkIndex,
    message: 'Done!',
    percent: 100,
  });

  return chunks;
}
