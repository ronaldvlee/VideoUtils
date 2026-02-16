import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import VideoChunker from './pages/VideoChunker';
import MediaConverter from './pages/MediaConverter';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/tools/video-chunker" element={<VideoChunker />} />
      <Route path="/tools/media-converter" element={<MediaConverter />} />
    </Routes>
  );
}
