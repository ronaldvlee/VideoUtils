import { useState } from 'react';
import styled from 'styled-components';
import Layout from '../components/Layout';
import DropZone from '../components/DropZone';
import FileInfo from '../components/FileInfo';
import ProgressBar from '../components/ProgressBar';
import Button from '../components/Button';
import { formatSize } from '../utils/formatSize';
import {
  loadFFmpeg,
  mountFile,
  unmountFile,
  getVideoInfo,
  calculateCompression,
  compressVideo,
} from '../tools/video-compressor';

const SIZE_PRESETS = [
  { label: '8 MB', bytes: 8 * 1024 * 1024 },
  { label: '25 MB', bytes: 25 * 1024 * 1024 },
  { label: '50 MB', bytes: 50 * 1024 * 1024 },
  { label: '100 MB', bytes: 100 * 1024 * 1024 },
];

const Settings = styled.div`
  margin-top: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const PresetRow = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
`;

const PresetButton = styled.button`
  background: ${({ theme, $active }) => $active ? theme.accent : theme.surface};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.text};
  border: 1px solid ${({ theme, $active }) => $active ? theme.accent : theme.border};
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const CustomSizeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const SizeInput = styled.input`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  color: ${({ theme }) => theme.text};
  padding: 0.4rem 0.75rem;
  font-size: 0.95rem;
  width: 6rem;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.accent};
  }
`;

const SizeUnit = styled.span`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.9rem;
`;

const InfoCard = styled.div`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-top: 1rem;
  font-size: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
`;

const InfoLabel = styled.span`
  color: ${({ theme }) => theme.textDim};
`;

const InfoValue = styled.span`
  font-weight: 500;
`;

const InfoDivider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.border};
  margin: 0.25rem 0;
`;

const ResultSection = styled.div`
  margin-top: 2rem;
`;

const ResultInfo = styled.div`
  display: flex;
  justify-content: space-between;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
`;

const ResultName = styled.span`
  font-weight: 500;
`;

const ResultSize = styled.span`
  color: ${({ theme }) => theme.textDim};
  flex-shrink: 0;
`;

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function VideoCompressor() {
  const [file, setFile] = useState(null);
  const [targetMB, setTargetMB] = useState(25);
  const [videoInfo, setVideoInfo] = useState(null);
  const [plan, setPlan] = useState(null);
  const [probing, setProbing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ value: 0, text: '' });
  const [result, setResult] = useState(null);

  const targetBytes = targetMB * 1024 * 1024;

  const activePreset = SIZE_PRESETS.find((p) => p.bytes === targetBytes);

  const updatePlan = (info, bytes) => {
    if (!info || !bytes) return;
    try {
      const p = calculateCompression(file?.size || 0, info.duration, info.width, info.height, bytes);
      setPlan(p);
    } catch {
      setPlan(null);
    }
  };

  const handleFile = async (f) => {
    setFile(f);
    setResult(null);
    setPlan(null);
    setVideoInfo(null);
    setProgress({ value: 0, text: '' });

    setProbing(true);
    try {
      setProgress({ value: 0, text: 'Loading FFmpeg...' });
      const ffmpeg = await loadFFmpeg();
      setProgress({ value: 10, text: 'Analyzing video...' });
      const inputPath = mountFile(ffmpeg, f);
      const info = await getVideoInfo(ffmpeg, inputPath);
      unmountFile(ffmpeg);

      setVideoInfo(info);
      const bytes = targetMB * 1024 * 1024;
      try {
        const p = calculateCompression(f.size, info.duration, info.width, info.height, bytes);
        setPlan(p);
      } catch {
        setPlan(null);
      }
      setProgress({ value: 0, text: '' });
    } catch (err) {
      console.error(err);
      setProgress({ value: 0, text: `Error: ${err.message}` });
    } finally {
      setProbing(false);
    }
  };

  const handleTargetChange = (mb) => {
    setTargetMB(mb);
    setResult(null);
    const bytes = mb * 1024 * 1024;
    if (videoInfo) {
      try {
        const p = calculateCompression(file.size, videoInfo.duration, videoInfo.width, videoInfo.height, bytes);
        setPlan(p);
      } catch {
        setPlan(null);
      }
    }
  };

  const handleCompress = async () => {
    if (!file || !plan || !videoInfo) return;

    setProcessing(true);
    setResult(null);

    let ffmpeg = null;
    try {
      setProgress({ value: 0, text: 'Loading FFmpeg...' });
      ffmpeg = await loadFFmpeg();

      setProgress({ value: 2, text: 'Mounting file...' });
      const inputPath = mountFile(ffmpeg, file);

      const blob = await compressVideo(ffmpeg, inputPath, plan, videoInfo.duration, (info) => {
        setProgress({ value: 2 + (info.percent * 0.96), text: info.message });
      });

      unmountFile(ffmpeg);

      const baseName = file.name.includes('.')
        ? file.name.substring(0, file.name.lastIndexOf('.'))
        : file.name;
      const resultName = `${baseName}_compressed.mp4`;

      setProgress({ value: 100, text: 'Done!' });
      setResult({ blob, name: resultName });
    } catch (err) {
      console.error(err);
      setProgress({ value: progress.value, text: `Error: ${err.message}` });
      try { unmountFile(ffmpeg); } catch { /* ignore */ }
    } finally {
      setProcessing(false);
    }
  };

  const tooSmall = file && targetBytes >= file.size;

  return (
    <Layout
      title="Video Compressor"
      subtitle="Compress videos to a target file size — entirely in your browser."
    >
      <DropZone
        accept="video/*,.mkv,.flv,.ogv,.webm,.h264,.264,.hevc,.265"
        label="Drag & drop a video file here"
        validate={(f) => f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|wmv|flv|webm|ogv|3gp|m4v)$/i.test(f.name)}
        onFile={handleFile}
      />

      {file && <FileInfo file={file} />}

      <Settings>
        <Label>Target file size</Label>
        <PresetRow>
          {SIZE_PRESETS.map((p) => (
            <PresetButton
              key={p.label}
              $active={activePreset?.bytes === p.bytes}
              onClick={() => handleTargetChange(p.bytes / 1024 / 1024)}
            >
              {p.label}
            </PresetButton>
          ))}
        </PresetRow>
        <CustomSizeRow>
          <SizeInput
            type="number"
            min="1"
            value={targetMB}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) handleTargetChange(v);
            }}
          />
          <SizeUnit>MB</SizeUnit>
        </CustomSizeRow>

        {tooSmall && (
          <InfoCard>
            <InfoRow>
              <InfoLabel>File is already smaller than the target size ({formatSize(targetBytes)})</InfoLabel>
            </InfoRow>
          </InfoCard>
        )}

        {videoInfo && plan && !tooSmall && (
          <InfoCard>
            <InfoRow>
              <InfoLabel>Duration</InfoLabel>
              <InfoValue>{videoInfo.duration.toFixed(1)}s</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Current resolution</InfoLabel>
              <InfoValue>{videoInfo.width} x {videoInfo.height}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Current size</InfoLabel>
              <InfoValue>{formatSize(file.size)}</InfoValue>
            </InfoRow>
            <InfoDivider />
            <InfoRow>
              <InfoLabel>Output resolution</InfoLabel>
              <InfoValue>{plan.newWidth} x {plan.newHeight}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Video bitrate</InfoLabel>
              <InfoValue>{Math.round(plan.videoBitrate / 1000)} kbps</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Audio bitrate</InfoLabel>
              <InfoValue>{Math.round(plan.audioBitrate / 1000)} kbps</InfoValue>
            </InfoRow>
            <InfoDivider />
            <InfoRow>
              <InfoLabel>Quality floor (144p)</InfoLabel>
              <InfoValue>{plan.minWidth} x {plan.minHeight} @ {Math.round(plan.minVideoBitrate / 1000)} kbps</InfoValue>
            </InfoRow>
          </InfoCard>
        )}

        <Button onClick={handleCompress} disabled={!file || !plan || processing || probing || tooSmall}>
          Compress
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Compressing" />
      )}

      {result && (
        <ResultSection>
          <h2>Compression Complete</h2>
          <ResultInfo>
            <ResultName>{result.name}</ResultName>
            <ResultSize>
              {formatSize(result.blob.size)}
              {' '}({Math.round((1 - result.blob.size / file.size) * 100)}% smaller)
            </ResultSize>
          </ResultInfo>
          <Button onClick={() => downloadBlob(result.blob, result.name)}>
            Download
          </Button>
        </ResultSection>
      )}
    </Layout>
  );
}
