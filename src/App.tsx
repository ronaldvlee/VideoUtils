import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import VideoChunker from './pages/VideoChunker';
import MediaConverter from './pages/MediaConverter';
import VideoCompressor from './pages/VideoCompressor';
import { loadFFmpeg } from './tools/ffmpeg';

export default function App() {
  useEffect(() => { loadFFmpeg(); }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/tools/video-chunker" element={<VideoChunker />} />
      <Route path="/tools/media-converter" element={<MediaConverter />} />
      <Route path="/tools/video-compressor" element={<VideoCompressor />} />
    </Routes>
  );
}
