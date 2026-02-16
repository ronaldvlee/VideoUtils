import { Link } from 'react-router-dom';
import styled from 'styled-components';

const Subtitle = styled.p`
  color: ${({ theme }) => theme.textDim};
  margin-bottom: 2rem;
`;

const ToolsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ToolCard = styled(Link)`
  display: flex;
  align-items: center;
  gap: 1rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  text-decoration: none;
  color: ${({ theme }) => theme.text};
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    background: ${({ theme }) => theme.surfaceHover};
    color: ${({ theme }) => theme.text};
  }
`;

const ToolIcon = styled.svg`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  color: ${({ theme }) => theme.accent};
`;

const ToolDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const ToolName = styled.span`
  font-weight: 600;
  font-size: 1rem;
`;

const ToolDesc = styled.span`
  color: ${({ theme }) => theme.textDim};
  font-size: 0.85rem;
`;

export default function Landing() {
  return (
    <>
      <h1>Video Utils</h1>
      <Subtitle>Browser-based video tools — no uploads, everything runs locally.</Subtitle>

      <ToolsGrid>
        <ToolCard to="/tools/video-chunker">
          <ToolIcon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </ToolIcon>
          <ToolDetails>
            <ToolName>Video Chunker</ToolName>
            <ToolDesc>Split large videos into smaller chunks by file size</ToolDesc>
          </ToolDetails>
        </ToolCard>

        <ToolCard to="/tools/media-converter">
          <ToolIcon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </ToolIcon>
          <ToolDetails>
            <ToolName>Media Converter</ToolName>
            <ToolDesc>Convert video and audio files between formats</ToolDesc>
          </ToolDetails>
        </ToolCard>
      </ToolsGrid>
    </>
  );
}
