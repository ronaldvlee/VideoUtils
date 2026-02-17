import { useState, useCallback } from 'react';
import styled from 'styled-components';
import * as Slider from '@radix-ui/react-slider';
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

const ChunksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ChunkItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.75rem 1rem;
`;

const ChunkInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const ChunkName = styled.span`
  font-weight: 500;
  font-size: 0.9rem;
`;

const ChunkSize = styled.span`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.8rem;
`;

const ChunkDownload = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accent};
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition:
    background 0.2s,
    color 0.2s;

  &:hover {
    background: ${({ theme }) => theme.accent};
    color: #fff;
  }
`;

export default function VideoChunker() {
  const [file, setFile] = useState<File | null>(null);
  const [chunkSizeMB, setChunkSizeMB] = useState(200);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ value: number; text: string }>({ value: 0, text: '' });
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [showResults, setShowResults] = useState(false);

  const getEstimate = useCallback(() => {
    if (!file) return '';
    const maxBytes = chunkSizeMB * 1024 * 1024;
    const estimated = Math.ceil(file.size / (maxBytes * 0.95));
    return `Estimated chunks: ~${estimated}`;
  }, [file, chunkSizeMB]);

  const handleFile = (f: File) => {
    setFile(f);
    setShowResults(false);
    setChunks([]);
    setProgress({ value: 0, text: '' });
  };

  const handleSplit = async () => {
    if (!file) return;

    setProcessing(true);
    setShowResults(false);
    setChunks([]);

    let ffmpeg: FFmpeg | null = null;
    try {
      setProgress({ value: 0, text: 'Loading FFmpeg (first time may take a moment)...' });
      ffmpeg = await loadFFmpeg();

      const maxBytes = chunkSizeMB * 1024 * 1024;

      if (file.size <= maxBytes) {
        setProgress({ value: 100, text: 'File is already under the size limit!' });
        setProcessing(false);
        return;
      }

      setProgress({ value: 5, text: 'Mounting video file...' });
      const inputPath = mountFile(ffmpeg, file);

      setProgress({ value: 10, text: 'Analyzing video duration...' });
      const duration = await getVideoDuration(ffmpeg, inputPath);

      const result = await splitVideo(
        ffmpeg,
        inputPath,
        file.name,
        file.size,
        duration,
        maxBytes,
        (info: ChunkProgress) => {
          setProgress({ value: 15 + info.percent * 0.85, text: info.message });
        }
      );

      unmountFile(ffmpeg);
      setChunks(result);
      setShowResults(true);
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
      title="Video Chunker"
      subtitle="Split large videos into smaller chunks — entirely in your browser."
    >
      <DropZone
        accept="video/*"
        label="Drag & drop a video file here"
        validate={(f: File) => f.type.startsWith('video/')}
        onFile={handleFile}
      />

      {file && <FileInfo file={file} />}

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
        <Button onClick={handleSplit} disabled={!file || processing}>
          Split Video
        </Button>
      </Settings>

      {(processing || progress.text) && (
        <ProgressBar value={progress.value} text={progress.text} title="Processing" />
      )}

      {showResults && chunks.length > 0 && (
        <ResultsSection>
          <h2>Chunks Ready</h2>
          <ChunksList>
            {chunks.map((chunk, i) => (
              <ChunkItem key={i}>
                <ChunkInfo>
                  <ChunkName>{chunk.name}</ChunkName>
                  <ChunkSize>{formatSize(chunk.size)}</ChunkSize>
                </ChunkInfo>
                <ChunkDownload onClick={() => downloadBlob(chunk.blob, chunk.name)}>
                  Download
                </ChunkDownload>
              </ChunkItem>
            ))}
          </ChunksList>
          <Button
            $variant="secondary"
            onClick={() => chunks.forEach((c) => downloadBlob(c.blob, c.name))}
          >
            Download All
          </Button>
        </ResultsSection>
      )}
    </Layout>
  );
}
