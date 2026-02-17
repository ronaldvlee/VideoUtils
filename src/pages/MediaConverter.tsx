import { useState } from 'react';
import styled from 'styled-components';
import * as Select from '@radix-ui/react-select';
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
  getMediaDuration,
  convertMedia,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  type ConvertProgress,
} from '../tools/media-converter';
import type { FFmpeg } from '../tools/ffmpeg';
import { downloadBlob } from '../utils/downloadBlob';

const ALL_EXTENSIONS = [...VIDEO_FORMATS, ...AUDIO_FORMATS] as const;

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : '';
}

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return true;
  return ALL_EXTENSIONS.includes(getExtension(file.name));
}

const Settings = styled.div`
  margin-top: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const SelectTrigger = styled(Select.Trigger)`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 20rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  color: ${({ theme }) => theme.text};
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.accent};
  }
`;

const SelectContent = styled(Select.Content)`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
`;

const SelectItem = styled(Select.Item)`
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  color: ${({ theme }) => theme.text};
  font-size: 0.9rem;

  &[data-highlighted] {
    background: ${({ theme }) => theme.accent};
    color: #fff;
    outline: none;
  }
`;

const SelectGroup = styled(Select.Group)``;

const SelectLabel = styled(Select.Label)`
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.textDim};
  font-weight: 600;
`;

const SelectSeparator = styled(Select.Separator)`
  height: 1px;
  background: ${({ theme }) => theme.border};
  margin: 0.25rem 0;
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
  error?: undefined;
}

interface FileError {
  name: string;
  error: string;
  blob?: undefined;
}

type ResultEntry = FileResult | FileError;

export default function MediaConverter() {
  const { files, addFiles, removeFile } = useFileList({ validate: isAcceptedFile });
  const [targetFormat, setTargetFormat] = useState('mp4');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; text: string }>({ value: 0, text: '' });
  const [results, setResults] = useState<ResultEntry[]>([]);

  const handleConvert = async () => {
    if (files.length === 0 || !targetFormat) return;

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
        setProgress({ value: fileBase, text: `Mounting ${label}...` });
        const inputPath = mountFile(ffmpeg, file);

        setProgress({ value: fileBase + perFile * 0.1, text: `Analyzing ${label}...` });
        const duration = await getMediaDuration(ffmpeg, inputPath);

        const blob = await convertMedia(
          ffmpeg,
          inputPath,
          targetFormat,
          duration,
          (info: ConvertProgress) => {
            const fileProgress = 0.1 + info.percent * 0.009;
            setProgress({
              value: fileBase + perFile * fileProgress,
              text: `Converting ${label}... ${info.percent}%`,
            });
          }
        );

        unmountFile(ffmpeg);

        const baseName = file.name.includes('.')
          ? file.name.substring(0, file.name.lastIndexOf('.'))
          : file.name;
        newResults.push({ blob, name: `${baseName}.${targetFormat}` });
      } catch (err) {
        console.error(`Error converting ${file.name}:`, err);
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
      title="Media Converter"
      subtitle="Convert video and audio files between formats — entirely in your browser."
    >
      <DropZone
        accept="video/*,audio/*,.mp3,.wav,.ogg,.aac,.wma,.flac,.m4a,.mkv,.flv,.ogv,.webm,.h264,.264,.hevc,.265"
        label="Drag & drop video or audio files here"
        multiple
        onFiles={addFiles}
      />

      <FileList files={files} onRemove={removeFile} />

      <Settings>
        <Label>Convert to</Label>
        <Select.Root value={targetFormat} onValueChange={setTargetFormat}>
          <SelectTrigger>
            <Select.Value />
            <Select.Icon>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 4l4 4 4-4" />
              </svg>
            </Select.Icon>
          </SelectTrigger>
          <Select.Portal>
            <SelectContent position="popper" sideOffset={4}>
              <Select.Viewport>
                <SelectGroup>
                  <SelectLabel>Video</SelectLabel>
                  {VIDEO_FORMATS.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      <Select.ItemText>{fmt.toUpperCase()}</Select.ItemText>
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Audio (extract audio track)</SelectLabel>
                  {AUDIO_FORMATS.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      <Select.ItemText>{fmt.toUpperCase()}</Select.ItemText>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </Select.Viewport>
            </SelectContent>
          </Select.Portal>
        </Select.Root>
        <Button onClick={handleConvert} disabled={files.length === 0 || processing}>
          Convert{files.length > 1 ? ` (${files.length} files)` : ''}
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Converting" />
      )}

      {results.length > 0 && (
        <ResultSection>
          <h2>Conversion Complete</h2>
          {results.map((r, i) => (
            <ResultRow key={i}>
              <ResultName>{r.error ? r.name : r.name}</ResultName>
              <ResultMeta>
                {r.error ? (
                  <ErrorTag>Error: {r.error}</ErrorTag>
                ) : (
                  <>
                    <ResultSize>{formatSize(r.blob.size)}</ResultSize>
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
