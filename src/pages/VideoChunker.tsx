import { useState } from 'react';
import styled from 'styled-components';
import * as Slider from '@radix-ui/react-slider';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { Download } from 'lucide-react';
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
  getVideoDuration,
  splitVideo,
  type Chunk,
  type ChunkProgress,
} from '../tools/video-chunker';
import type { FFmpeg } from '../tools/ffmpeg';
import { downloadBlob } from '../utils/downloadBlob';

const Settings = styled.div`
  margin-top: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const SizeControls = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const SliderRoot = styled(Slider.Root)`
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  height: 20px;
  user-select: none;
  touch-action: none;
`;

const SliderTrack = styled(Slider.Track)`
  background: ${({ theme }) => theme.surface};
  position: relative;
  flex-grow: 1;
  height: 6px;
  border-radius: 3px;
`;

const SliderRange = styled(Slider.Range)`
  position: absolute;
  background: ${({ theme }) => theme.accent};
  border-radius: 3px;
  height: 100%;
`;

const SliderThumb = styled(Slider.Thumb)`
  display: block;
  width: 16px;
  height: 16px;
  background: ${({ theme }) => theme.accent};
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.accentHover};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.3);
  }
`;

const SizeInputGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const NumberInput = styled.input`
  width: 5rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  color: ${({ theme }) => theme.text};
  padding: 0.4rem 0.5rem;
  font-size: 0.9rem;
  text-align: right;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.accent};
  }
`;

const SizeUnit = styled.span`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.9rem;
`;

const Estimate = styled.p`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.85rem;
  margin-top: 0.5rem;
  min-height: 1.2em;
`;

const ResultsSection = styled.div`
  margin-top: 2rem;
`;

const ScrollRoot = styled(ScrollArea.Root)`
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surface};
`;

const ScrollViewport = styled(ScrollArea.Viewport)`
  width: 100%;
  max-height: 320px;
`;

const ScrollBar = styled(ScrollArea.Scrollbar)`
  display: flex;
  user-select: none;
  touch-action: none;
  padding: 2px;

  &[data-orientation='vertical'] {
    width: 8px;
  }
`;

const ScrollThumb = styled(ScrollArea.Thumb)`
  flex: 1;
  background: ${({ theme }) => theme.border};
  border-radius: 4px;
  position: relative;

  &:hover {
    background: ${({ theme }) => theme.textDim};
  }
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: ${({ theme }) => theme.bg};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  position: sticky;
  top: 0;
  z-index: 1;
`;

const GroupName = styled.span`
  font-weight: 600;
  font-size: 0.85rem;
`;

const GroupDownload = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;

  &:hover {
    background: ${({ theme }) => theme.surfaceHover};
  }
`;

const ChunkRow = styled.div`
  display: flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  gap: 0.75rem;

  &:last-child {
    border-bottom: none;
  }
`;

const ChunkName = styled.span`
  font-size: 0.85rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChunkSize = styled.span`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.8rem;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.surfaceHover};
  }
`;

const ErrorTag = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
`;

const DownloadAllRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: 0.5rem;
`;

const isVideoFile = (f: File) =>
  f.type.startsWith('video/') || /\.(mp4|mkv|avi|mov|wmv|flv|webm|ogv|3gp|m4v)$/i.test(f.name);

interface FileChunkResult {
  fileName: string;
  chunks: Chunk[];
  error?: undefined;
}

interface FileChunkError {
  fileName: string;
  error: string;
  chunks?: undefined;
}

type ChunkResultEntry = FileChunkResult | FileChunkError;

export default function VideoChunker() {
  const { files, addFiles, removeFile } = useFileList({ validate: isVideoFile });
  const [chunkSizeMB, setChunkSizeMB] = useState(200);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; text: string }>({ value: 0, text: '' });
  const [results, setResults] = useState<ChunkResultEntry[]>([]);

  const getEstimate = () => {
    if (files.length === 0) return '';
    const maxBytes = chunkSizeMB * 1024 * 1024;
    const totalChunks = files.reduce((sum, f) => sum + Math.ceil(f.size / (maxBytes * 0.95)), 0);
    return `Estimated chunks: ~${totalChunks} total across ${files.length} file${files.length > 1 ? 's' : ''}`;
  };

  const handleSplit = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setResults([]);

    const total = files.length;
    const perFile = 100 / total;
    const newResults: ChunkResultEntry[] = [];

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
      const maxBytes = chunkSizeMB * 1024 * 1024;

      try {
        if (file.size <= maxBytes) {
          newResults.push({ fileName: file.name, chunks: [] });
          continue;
        }

        setProgress({ value: fileBase, text: `Mounting ${label}...` });
        const inputPath = mountFile(ffmpeg, file);

        setProgress({ value: fileBase + perFile * 0.05, text: `Analyzing ${label}...` });
        const duration = await getVideoDuration(ffmpeg, inputPath);

        const chunks = await splitVideo(
          ffmpeg,
          inputPath,
          file.name,
          file.size,
          duration,
          maxBytes,
          (info: ChunkProgress) => {
            const fileProgress = 0.1 + info.percent * 0.009;
            setProgress({
              value: fileBase + perFile * fileProgress,
              text: `Splitting ${label}... chunk ${info.current} of ~${info.total}`,
            });
          }
        );

        unmountFile(ffmpeg);
        newResults.push({ fileName: file.name, chunks });
      } catch (err) {
        console.error(`Error splitting ${file.name}:`, err);
        const message = err instanceof Error ? err.message : String(err);
        newResults.push({ fileName: file.name, error: message });
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

  const allChunks = results.flatMap((r) => (r.chunks ? r.chunks : []));

  return (
    <Layout
      title="Video Chunker"
      subtitle="Split large videos into smaller chunks — entirely in your browser."
    >
      <DropZone accept="video/*" label="Drag & drop video files here" multiple onFiles={addFiles} />

      <FileList files={files} onRemove={removeFile} />

      <Settings>
        <Label>Max chunk size</Label>
        <SizeControls>
          <SliderRoot
            value={[chunkSizeMB]}
            onValueChange={([v]) => setChunkSizeMB(v)}
            min={10}
            max={2000}
            step={10}
          >
            <SliderTrack>
              <SliderRange />
            </SliderTrack>
            <SliderThumb />
          </SliderRoot>
          <SizeInputGroup>
            <NumberInput
              type="number"
              min={10}
              max={2000}
              step={10}
              value={chunkSizeMB}
              onChange={(e) => setChunkSizeMB(Number(e.target.value))}
            />
            <SizeUnit>MB</SizeUnit>
          </SizeInputGroup>
        </SizeControls>
        <Estimate>{getEstimate()}</Estimate>
        <Button onClick={handleSplit} disabled={files.length === 0 || processing}>
          Split{files.length > 1 ? ` (${files.length} files)` : ''}
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Processing" />
      )}

      {results.length > 0 && (
        <ResultsSection>
          <ScrollRoot>
            <ScrollViewport>
              {results.map((r, i) => {
                const showHeader = results.length > 1;
                return (
                  <div key={i}>
                    {showHeader && (
                      <GroupHeader>
                        <GroupName>{r.fileName}</GroupName>
                        {r.chunks && r.chunks.length > 1 && (
                          <GroupDownload
                            onClick={() => r.chunks.forEach((c) => downloadBlob(c.blob, c.name))}
                          >
                            <Download size={14} /> All
                          </GroupDownload>
                        )}
                      </GroupHeader>
                    )}
                    {r.error ? (
                      <ErrorTag>Error: {r.error}</ErrorTag>
                    ) : r.chunks.length === 0 ? (
                      <ErrorTag>File is already under the size limit</ErrorTag>
                    ) : (
                      r.chunks.map((chunk, j) => (
                        <ChunkRow key={j}>
                          <ChunkName>{chunk.name}</ChunkName>
                          <ChunkSize>{formatSize(chunk.size)}</ChunkSize>
                          <IconButton onClick={() => downloadBlob(chunk.blob, chunk.name)}>
                            <Download size={14} />
                          </IconButton>
                        </ChunkRow>
                      ))
                    )}
                  </div>
                );
              })}
            </ScrollViewport>
            <ScrollBar orientation="vertical">
              <ScrollThumb />
            </ScrollBar>
          </ScrollRoot>
          {allChunks.length > 1 && (
            <DownloadAllRow>
              <Button onClick={() => allChunks.forEach((c) => downloadBlob(c.blob, c.name))}>
                <Download size={14} style={{ marginRight: '0.4rem' }} /> Download All (
                {allChunks.length})
              </Button>
            </DownloadAllRow>
          )}
        </ResultsSection>
      )}
    </Layout>
  );
}
