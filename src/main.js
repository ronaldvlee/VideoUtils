import './style.css';
import { loadFFmpeg, mountFile, unmountFile, getVideoDuration, splitVideo } from './ffmpeg-worker.js';

// DOM elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const settings = document.getElementById('settings');
const chunkSlider = document.getElementById('chunk-slider');
const chunkSize = document.getElementById('chunk-size');
const estimate = document.getElementById('estimate');
const splitBtn = document.getElementById('split-btn');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const resultsSection = document.getElementById('results-section');
const chunksList = document.getElementById('chunks-list');
const downloadAllBtn = document.getElementById('download-all-btn');

let selectedFile = null;
let resultChunks = [];

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
  if (file && file.type.startsWith('video/')) {
    handleFile(file);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileInfo.classList.remove('hidden');
  settings.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  updateEstimate();
}

// -- Size controls --

chunkSlider.addEventListener('input', () => {
  chunkSize.value = chunkSlider.value;
  updateEstimate();
});

chunkSize.addEventListener('input', () => {
  chunkSlider.value = chunkSize.value;
  updateEstimate();
});

function updateEstimate() {
  if (!selectedFile) return;
  const maxBytes = parseInt(chunkSize.value, 10) * 1024 * 1024;
  const estimated = Math.ceil(selectedFile.size / (maxBytes * 0.95));
  estimate.textContent = `Estimated chunks: ~${estimated}`;
}

// -- Split --

splitBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  splitBtn.disabled = true;
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  resultChunks = [];
  chunksList.innerHTML = '';

  let ffmpeg = null;
  try {
    progressText.textContent = 'Loading FFmpeg (first time may take a moment)...';
    progressBar.style.width = '0%';

    ffmpeg = await loadFFmpeg();

    const maxBytes = parseInt(chunkSize.value, 10) * 1024 * 1024;

    if (selectedFile.size <= maxBytes) {
      progressText.textContent = 'File is already under the size limit!';
      progressBar.style.width = '100%';
      splitBtn.disabled = false;
      return;
    }

    progressText.textContent = 'Mounting video file...';
    progressBar.style.width = '5%';

    // Mount the file via WORKERFS — FFmpeg reads on-demand, no full copy into memory
    const inputPath = mountFile(ffmpeg, selectedFile);

    progressText.textContent = 'Analyzing video duration...';
    progressBar.style.width = '10%';

    const duration = await getVideoDuration(ffmpeg, inputPath);

    resultChunks = await splitVideo(ffmpeg, inputPath, selectedFile.name, selectedFile.size, duration, maxBytes, (info) => {
      progressText.textContent = info.message;
      // Map progress from 15% to 100%
      progressBar.style.width = `${15 + (info.percent * 0.85)}%`;
    });

    unmountFile(ffmpeg);
    showResults();
  } catch (err) {
    console.error(err);
    progressText.textContent = `Error: ${err.message}`;
    try { unmountFile(ffmpeg); } catch { /* ignore */ }
  } finally {
    splitBtn.disabled = false;
  }
});

// -- Results --

function showResults() {
  resultsSection.classList.remove('hidden');
  chunksList.innerHTML = '';

  resultChunks.forEach((chunk, i) => {
    const item = document.createElement('div');
    item.className = 'chunk-item';
    item.innerHTML = `
      <div class="chunk-info">
        <span class="chunk-name">${chunk.name}</span>
        <span class="chunk-size">${formatSize(chunk.size)}</span>
      </div>
      <button class="chunk-download" data-index="${i}">Download</button>
    `;
    chunksList.appendChild(item);
  });

  chunksList.addEventListener('click', (e) => {
    if (e.target.classList.contains('chunk-download')) {
      const idx = parseInt(e.target.dataset.index, 10);
      downloadChunk(resultChunks[idx]);
    }
  });
}

downloadAllBtn.addEventListener('click', () => {
  resultChunks.forEach((chunk) => downloadChunk(chunk));
});

function downloadChunk(chunk) {
  const url = URL.createObjectURL(chunk.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = chunk.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -- Helpers --

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
