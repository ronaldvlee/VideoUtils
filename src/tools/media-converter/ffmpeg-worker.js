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

export function mountFile(ffmpeg, file) {
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

export async function getMediaDuration(ffmpeg, inputPath) {
  let durationStr = '';
  const logHandler = ({ message }) => {
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

  const match = durationStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const centiseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

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

/**
 * Determine if converting from inputExt to outputExt is a video-to-audio conversion,
 * meaning we should strip the video track with -vn.
 */
function isVideoToAudio(inputExt, outputExt) {
  const audioOnlyFormats = ['mp3', 'wav', 'ogg', 'aac', 'wma', 'flac', 'm4a'];
  const videoFormats = ['mp4', 'm4v', 'mp4v', '3gp', '3g2', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'ogv', 'webm', 'h264', '264', 'hevc', '265'];

  return videoFormats.includes(inputExt) && audioOnlyFormats.includes(outputExt);
}

export async function convertMedia(ffmpeg, inputPath, outputFormat, duration, onProgress) {
  const inputExt = inputPath.split('.').pop().toLowerCase();
  const outputName = `output.${outputFormat}`;

  const args = ['-i', inputPath];

  if (isVideoToAudio(inputExt, outputFormat)) {
    args.push('-vn');
  }

  args.push(outputName);

  // Track progress via time= log output
  const logHandler = ({ message }) => {
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

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer]);
  await ffmpeg.deleteFile(outputName);

  return blob;
}
