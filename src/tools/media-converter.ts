import type { FFmpeg, LogCallback } from './ffmpeg';
import { parseTimeToSeconds } from './ffmpeg';

export { loadFFmpeg, mountFile, unmountFile } from './ffmpeg';

export const VIDEO_FORMATS = [
  'mp4',
  'm4v',
  'mp4v',
  '3gp',
  '3g2',
  'avi',
  'mov',
  'wmv',
  'mkv',
  'flv',
  'ogv',
  'webm',
  'h264',
  '264',
  'hevc',
  '265',
] as const;
export const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'wma', 'flac', 'm4a'] as const;
export const IMAGE_FORMATS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'ico',
  'tif',
  'tiff',
  'svg',
  'raw',
  'tga',
] as const;

export interface ConvertProgress {
  percent: number;
  message: string;
}

function isVideoToAudio(inputExt: string, outputExt: string): boolean {
  return (
    (VIDEO_FORMATS as readonly string[]).includes(inputExt) &&
    (AUDIO_FORMATS as readonly string[]).includes(outputExt)
  );
}

function isImage(ext: string): boolean {
  return (IMAGE_FORMATS as readonly string[]).includes(ext);
}

export async function getMediaDuration(ffmpeg: FFmpeg, inputPath: string): Promise<number> {
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
    return 0; // Unknown duration — progress will be indeterminate
  }

  return parseTimeToSeconds(durationStr.replace('Duration: ', ''));
}

export async function convertMedia(
  ffmpeg: FFmpeg,
  inputPath: string,
  outputFormat: string,
  duration: number,
  onProgress: (info: ConvertProgress) => void
): Promise<Blob> {
  const inputExt = inputPath.split('.').pop()!.toLowerCase();
  const outputName = `output.${outputFormat}`;

  const args = ['-i', inputPath];

  if (isVideoToAudio(inputExt, outputFormat)) {
    args.push('-vn');
  }

  if (isImage(outputFormat)) {
    args.push('-frames:v', '1');
  }

  args.push(outputName);

  const logHandler: LogCallback = ({ message }) => {
    const match = message.match(/time=\s*(\d+:\d+:\d+\.\d+)/);
    if (match && duration > 0) {
      const currentTime = parseTimeToSeconds(match[1]);
      const percent = Math.min(Math.round((currentTime / duration) * 100), 100);
      onProgress({ percent, message: `Converting... ${percent}%` });
    }
  };

  ffmpeg.on('log', logHandler);
  await ffmpeg.exec(args);
  ffmpeg.off('log', logHandler);

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  const blob = new Blob([data.buffer as ArrayBuffer]);
  await ffmpeg.deleteFile(outputName);

  return blob;
}
