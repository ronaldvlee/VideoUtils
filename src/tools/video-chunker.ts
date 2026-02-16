import type { FFmpeg, LogCallback } from './ffmpeg';
import { parseTimeToSeconds } from './ffmpeg';

export { loadFFmpeg, mountFile, unmountFile } from './ffmpeg';

export interface ChunkProgress {
  current: number;
  total: number;
  message: string;
  percent: number;
}

export interface Chunk {
  name: string;
  blob: Blob;
  size: number;
}

export async function getVideoDuration(ffmpeg: FFmpeg, inputPath: string): Promise<number> {
  let durationStr = '';
  const logHandler: LogCallback = ({ message }) => {
    const match = message.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      durationStr = match[0];
    }
  };

  ffmpeg.on('log', logHandler);
  await ffmpeg.exec(['-i', inputPath, '-f', 'null', '-t', '0', '-']);
  ffmpeg.off('log', logHandler);

  if (!durationStr) {
    throw new Error('Could not determine video duration.');
  }

  return parseTimeToSeconds(durationStr.replace('Duration: ', ''));
}

export async function splitVideo(
  ffmpeg: FFmpeg,
  inputPath: string,
  fileName: string,
  fileSize: number,
  duration: number,
  maxChunkBytes: number,
  onProgress: (info: ChunkProgress) => void,
): Promise<Chunk[]> {
  const avgBitrate = fileSize / duration; // bytes per second
  const estimatedChunkDuration = (maxChunkBytes * 0.95) / avgBitrate;
  const estimatedTotalChunks = Math.ceil(duration / estimatedChunkDuration);

  const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '.mp4';
  const baseName = fileName.includes('.')
    ? fileName.substring(0, fileName.lastIndexOf('.'))
    : fileName;

  const chunks: Chunk[] = [];
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
    const timeHandler: LogCallback = ({ message }) => {
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

    const data = await ffmpeg.readFile(chunkName) as Uint8Array;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
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
