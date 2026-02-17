import styled from 'styled-components';
import { formatSize } from '../utils/formatSize';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
`;

const FileName = styled.span`
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.textDim};
  flex-shrink: 0;
  font-size: 0.85rem;
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.textDim};
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  font-size: 1.1rem;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.text};
    background: rgba(255, 255, 255, 0.08);
  }
`;

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function FileList({ files, onRemove }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <List>
      {files.map((file, i) => (
        <Row key={`${file.name}-${file.size}-${i}`}>
          <FileName>{file.name}</FileName>
          <Meta>{file.type || 'unknown'}</Meta>
          <Meta>{formatSize(file.size)}</Meta>
          <RemoveButton onClick={() => onRemove(i)} title="Remove file">
            ✕
          </RemoveButton>
        </Row>
      ))}
    </List>
  );
}
