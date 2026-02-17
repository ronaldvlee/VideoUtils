import { useState, useMemo } from 'react';
import styled from 'styled-components';
import * as Select from '@radix-ui/react-select';
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
  getMediaDuration,
  convertMedia,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  type ConvertProgress,
} from '../tools/media-converter';
import type { FFmpeg } from '../tools/ffmpeg';

const ALL_EXTENSIONS = [...VIDEO_FORMATS, ...AUDIO_FORMATS] as const;

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.substring(dot + 1).toLowerCase() : '';
}

function isAcceptedFile(file: File): boolean {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return true;
  return ALL_EXTENSIONS.includes(getExtension(file.name));
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return VIDEO_FORMATS.includes(getExtension(file.name));
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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface FormatOptions {
  isVideo: boolean;
  video: readonly string[];
  audio: readonly string[];
}

interface Result {
  blob: Blob;
  name: string;
}

export default function MediaConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState('mp4');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; text: string }>({ value: 0, text: '' });
  const [result, setResult] = useState<Result | null>(null);

  const formatOptions: FormatOptions = useMemo(() => {
    if (!file) return { video: VIDEO_FORMATS, audio: AUDIO_FORMATS, isVideo: true };
    const ext = getExtension(file.name);
    const isVideo = isVideoFile(file);

    if (isVideo) {
      return {
        isVideo: true,
        video: VIDEO_FORMATS.filter((f) => f !== ext),
        audio: AUDIO_FORMATS,
      };
    }
    return {
      isVideo: false,
      video: [],
      audio: AUDIO_FORMATS.filter((f) => f !== ext),
    };
  }, [file]);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setProgress({ value: 0, text: '' });

    const ext = getExtension(f.name);
    const isVideo = isVideoFile(f);
    if (isVideo) {
      const first = VIDEO_FORMATS.find((fmt) => fmt !== ext);
      setTargetFormat(first || 'mp4');
    } else {
      const first = AUDIO_FORMATS.find((fmt) => fmt !== ext);
      setTargetFormat(first || 'mp3');
    }
  };

  const handleConvert = async () => {
    if (!file || !targetFormat) return;

    setProcessing(true);
    setResult(null);

    let ffmpeg: FFmpeg | null = null;
    try {
      setProgress({ value: 0, text: 'Loading FFmpeg (first time may take a moment)...' });
      ffmpeg = await loadFFmpeg();

      setProgress({ value: 5, text: 'Mounting file...' });
      const inputPath = mountFile(ffmpeg, file);

      setProgress({ value: 10, text: 'Analyzing media duration...' });
      const duration = await getMediaDuration(ffmpeg, inputPath);

      const blob = await convertMedia(
        ffmpeg,
        inputPath,
        targetFormat,
        duration,
        (info: ConvertProgress) => {
          setProgress({ value: 10 + info.percent * 0.9, text: info.message });
        }
      );

      unmountFile(ffmpeg);

      const baseName = file.name.includes('.')
        ? file.name.substring(0, file.name.lastIndexOf('.'))
        : file.name;
      const resultName = `${baseName}.${targetFormat}`;

      setProgress({ value: 100, text: 'Done!' });
      setResult({ blob, name: resultName });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setProgress({ value: progress.value, text: `Error: ${message}` });
      try {
        if (ffmpeg) unmountFile(ffmpeg);
      } catch {
        /* ignore */
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Layout
      title="Media Converter"
      subtitle="Convert video and audio files between formats — entirely in your browser."
    >
      <DropZone
        accept="video/*,audio/*,.mp3,.wav,.ogg,.aac,.wma,.flac,.m4a,.mkv,.flv,.ogv,.webm,.h264,.264,.hevc,.265"
        label="Drag & drop a video or audio file here"
        validate={isAcceptedFile}
        onFile={handleFile}
      />

      {file && <FileInfo file={file} />}

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
                {formatOptions.isVideo && (
                  <>
                    <SelectGroup>
                      <SelectLabel>Video</SelectLabel>
                      {formatOptions.video.map((fmt) => (
                        <SelectItem key={fmt} value={fmt}>
                          <Select.ItemText>{fmt.toUpperCase()}</Select.ItemText>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Audio (extract audio track)</SelectLabel>
                      {formatOptions.audio.map((fmt) => (
                        <SelectItem key={fmt} value={fmt}>
                          <Select.ItemText>{fmt.toUpperCase()}</Select.ItemText>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
                {!formatOptions.isVideo && (
                  <SelectGroup>
                    {formatOptions.audio.map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        <Select.ItemText>{fmt.toUpperCase()}</Select.ItemText>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </Select.Viewport>
            </SelectContent>
          </Select.Portal>
        </Select.Root>
        <Button onClick={handleConvert} disabled={!file || processing}>
          Convert
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Converting" />
      )}

      {result && (
        <ResultSection>
          <h2>Conversion Complete</h2>
          <ResultInfo>
            <ResultName>{result.name}</ResultName>
            <ResultSize>{formatSize(result.blob.size)}</ResultSize>
          </ResultInfo>
          <Button onClick={() => downloadBlob(result.blob, result.name)}>Download</Button>
        </ResultSection>
      )}
    </Layout>
  );
}
