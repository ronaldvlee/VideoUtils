import '../../shared/style.css';
import './style.css';
import { loadFFmpeg, mountFile, unmountFile, getMediaDuration, convertMedia } from './ffmpeg-worker.js';

const VIDEO_FORMATS = ['mp4', 'm4v', 'mp4v', '3gp', '3g2', 'avi', 'mov', 'wmv', 'mkv', 'flv', 'ogv', 'webm', 'h264', '264', 'hevc', '265'];
const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'wma', 'flac', 'm4a'];
const ALL_EXTENSIONS = [...VIDEO_FORMATS, ...AUDIO_FORMATS];

// DOM elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const settings = document.getElementById('settings');
const outputFormat = document.getElementById('output-format');
const convertBtn = document.getElementById('convert-btn');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultSection = document.getElementById('result-section');
const resultInfo = document.getElementById('result-info');
const downloadBtn = document.getElementById('download-btn');

let selectedFile = null;
let resultBlob = null;
let resultFileName = '';

// -- File selection --

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && isAcceptedFile(file)) {
    handleFile(file);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) {
    handleFile(fileInput.files[0]);
  }
});

function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : '';
}

function isAcceptedFile(file) {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return true;
  return ALL_EXTENSIONS.includes(getExtension(file.name));
}

function isVideoFile(file) {
  if (file.type.startsWith('video/')) return true;
  return VIDEO_FORMATS.includes(getExtension(file.name));
}

function handleFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileInfo.classList.remove('hidden');
  settings.classList.remove('hidden');
  resultSection.classList.add('hidden');
  progressSection.classList.add('hidden');

  populateFormats(file);
}

function populateFormats(file) {
  const ext = getExtension(file.name);
  const isVideo = isVideoFile(file);

  outputFormat.innerHTML = '';

  if (isVideo) {
    const videoGroup = document.createElement('optgroup');
    videoGroup.label = 'Video';
    for (const fmt of VIDEO_FORMATS) {
      if (fmt === ext) continue;
      const option = document.createElement('option');
      option.value = fmt;
      option.textContent = fmt.toUpperCase();
      videoGroup.appendChild(option);
    }
    outputFormat.appendChild(videoGroup);

    const audioGroup = document.createElement('optgroup');
    audioGroup.label = 'Audio (extract audio track)';
    for (const fmt of AUDIO_FORMATS) {
      const option = document.createElement('option');
      option.value = fmt;
      option.textContent = fmt.toUpperCase();
      audioGroup.appendChild(option);
    }
    outputFormat.appendChild(audioGroup);
  } else {
    for (const fmt of AUDIO_FORMATS) {
      if (fmt === ext) continue;
      const option = document.createElement('option');
      option.value = fmt;
      option.textContent = fmt.toUpperCase();
      outputFormat.appendChild(option);
    }
  }
}

// -- Convert --

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  progressSection.classList.remove('hidden');
  resultSection.classList.add('hidden');

  let ffmpeg = null;
  try {
    progressText.textContent = 'Loading FFmpeg (first time may take a moment)...';
    progressBar.style.width = '0%';

    ffmpeg = await loadFFmpeg();

    progressText.textContent = 'Mounting file...';
    progressBar.style.width = '5%';

    const inputPath = mountFile(ffmpeg, selectedFile);

    progressText.textContent = 'Analyzing media duration...';
    progressBar.style.width = '10%';

    const duration = await getMediaDuration(ffmpeg, inputPath);

    const targetFormat = outputFormat.value;

    resultBlob = await convertMedia(ffmpeg, inputPath, targetFormat, duration, (info) => {
      progressText.textContent = info.message;
      progressBar.style.width = `${10 + (info.percent * 0.9)}%`;
    });

    unmountFile(ffmpeg);

    const baseName = selectedFile.name.includes('.')
      ? selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'))
      : selectedFile.name;
    resultFileName = `${baseName}.${targetFormat}`;

    progressText.textContent = 'Done!';
    progressBar.style.width = '100%';

    showResult();
  } catch (err) {
    console.error(err);
    progressText.textContent = `Error: ${err.message}`;
    try { unmountFile(ffmpeg); } catch { /* ignore */ }
  } finally {
    convertBtn.disabled = false;
  }
});

// -- Result --

function showResult() {
  resultSection.classList.remove('hidden');
  resultInfo.innerHTML = `
    <span class="result-name">${resultFileName}</span>
    <span class="result-size">${formatSize(resultBlob.size)}</span>
  `;
}

downloadBtn.addEventListener('click', () => {
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = resultFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// -- Helpers --

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
