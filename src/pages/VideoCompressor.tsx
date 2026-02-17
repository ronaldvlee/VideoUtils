import { useState } from 'react';
import styled from 'styled-components';
import Layout from '../components/Layout';
import DropZone from '../components/DropZone';
import FileList from '../components/FileList';
import ProgressBar from '../components/ProgressBar';
import Button from '../components/Button';
import { formatSize } from '../utils/formatSize';
import { useFileList } from '../hooks/useFileList';
import {
  loadFFmpeg,
  mountFile,
  unmountFile,
  getVideoInfo,
  calculateCompression,
  compressVideo,
  type CompressProgress,
} from '../tools/video-compressor';
import type { FFmpeg } from '../tools/ffmpeg';
import { downloadBlob } from '../utils/downloadBlob';

const isVideoFile = (f: File) =>
  f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|wmv|flv|webm|ogv|3gp|m4v)$/i.test(f.name);

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

const PresetButton = styled.button<{ $active?: boolean }>`
  background: ${({ theme, $active }) => ($active ? theme.accent : theme.surface)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.text)};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.border)};
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

const ResultSection = styled.div`
  margin-top: 2rem;
`;

const ResultRow = styled.div`
  display: flex;
  align-items: center;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  margin-right: 1rem;
`;

const ResultMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
`;

const ResultSize = styled.span`
  color: ${({ theme }) => theme.textDim};
`;

const ErrorTag = styled.span`
  color: #e74c3c;
  font-size: 0.85rem;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
`;

interface FileResult {
  blob: Blob;
  name: string;
  originalSize: number;
  error?: undefined;
}

interface FileError {
  name: string;
  error: string;
  blob?: undefined;
}

type ResultEntry = FileResult | FileError;

export default function VideoCompressor() {
  const { files, addFiles, removeFile } = useFileList({ validate: isVideoFile });
  const [targetMB, setTargetMB] = useState(25);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; text: string }>({ value: 0, text: '' });
  const [results, setResults] = useState<ResultEntry[]>([]);

  const targetBytes = targetMB * 1024 * 1024;
  const activePreset = SIZE_PRESETS.find((p) => p.bytes === targetBytes);

  const handleCompress = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setResults([]);

    const total = files.length;
    const perFile = 100 / total;
    const newResults: ResultEntry[] = [];

    let ffmpeg: FFmpeg | null = null;
    try {
      setProgress({ value: 0, text: 'Loading FFmpeg (first time may take a moment)...' });
      ffmpeg = await loadFFmpeg();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProgress({ value: 0, text: `Error loading FFmpeg: ${message}` });
      setProcessing(false);
      return;
    }

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const fileBase = perFile * i;
      const label = total > 1 ? `(${i + 1}/${total}) ${file.name}` : file.name;

      try {
        if (file.size <= targetBytes) {
          newResults.push({ name: file.name, error: 'Already smaller than target size' });
          continue;
        }

        setProgress({ value: fileBase, text: `Mounting ${label}...` });
        const inputPath = mountFile(ffmpeg, file);

        setProgress({ value: fileBase + perFile * 0.05, text: `Analyzing ${label}...` });
        const info = await getVideoInfo(ffmpeg, inputPath);
        unmountFile(ffmpeg);

        const plan = calculateCompression(
          file.size,
          info.duration,
          info.width,
          info.height,
          targetBytes
        );

        setProgress({ value: fileBase + perFile * 0.1, text: `Compressing ${label}...` });
        const inputPath2 = mountFile(ffmpeg, file);

        const blob = await compressVideo(
          ffmpeg,
          inputPath2,
          plan,
          info.duration,
          (p: CompressProgress) => {
            const fileProgress = 0.1 + p.percent * 0.009;
            setProgress({
              value: fileBase + perFile * fileProgress,
              text: `Compressing ${label}... ${p.message}`,
            });
          }
        );

        unmountFile(ffmpeg);

        const baseName = file.name.includes('.')
          ? file.name.substring(0, file.name.lastIndexOf('.'))
          : file.name;

        newResults.push({ blob, name: `${baseName}_compressed.mp4`, originalSize: file.size });
      } catch (err) {
        console.error(`Error compressing ${file.name}:`, err);
        const message = err instanceof Error ? err.message : String(err);
        newResults.push({ name: file.name, error: message });
        try {
          unmountFile(ffmpeg);
        } catch {
          /* ignore */
        }
      }
    }

    setProgress({ value: 100, text: 'Done!' });
    setResults(newResults);
    setProcessing(false);
  };

  const successResults = results.filter((r): r is FileResult => !r.error);

  const handleDownloadAll = () => {
    for (const r of successResults) {
      downloadBlob(r.blob, r.name);
    }
  };

  return (
    <Layout
      title="Video Compressor"
      subtitle="Compress videos to a target file size — entirely in your browser."
    >
      <DropZone
        accept="video/*,.mkv,.flv,.ogv,.webm,.h264,.264,.hevc,.265"
        label="Drag & drop video files here"
        multiple
        onFiles={addFiles}
      />

      <FileList files={files} onRemove={removeFile} />

      <Settings>
        <Label>Target file size</Label>
        <PresetRow>
          {SIZE_PRESETS.map((p) => (
            <PresetButton
              key={p.label}
              $active={activePreset?.bytes === p.bytes}
              onClick={() => setTargetMB(p.bytes / 1024 / 1024)}
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
              if (v > 0) setTargetMB(v);
            }}
          />
          <SizeUnit>MB</SizeUnit>
        </CustomSizeRow>

        <Button onClick={handleCompress} disabled={files.length === 0 || processing}>
          Compress{files.length > 1 ? ` (${files.length} files)` : ''}
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Compressing" />
      )}

      {results.length > 0 && (
        <ResultSection>
          <h2>Compression Complete</h2>
          {results.map((r, i) => (
            <ResultRow key={i}>
              <ResultName>{r.name}</ResultName>
              <ResultMeta>
                {r.error ? (
                  <ErrorTag>{r.error}</ErrorTag>
                ) : (
                  <>
                    <ResultSize>
                      {formatSize(r.blob.size)} (
                      {Math.round((1 - r.blob.size / r.originalSize) * 100)}% smaller)
                    </ResultSize>
                    <Button onClick={() => downloadBlob(r.blob, r.name)}>Download</Button>
                  </>
                )}
              </ResultMeta>
            </ResultRow>
          ))}
          {successResults.length > 1 && (
            <ButtonRow>
              <Button onClick={handleDownloadAll}>Download All</Button>
            </ButtonRow>
          )}
        </ResultSection>
      )}
    </Layout>
  );
}
