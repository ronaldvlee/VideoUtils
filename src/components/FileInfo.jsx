import styled from 'styled-components';
import { formatSize } from '../utils/formatSize';

const Wrapper = styled.div`
  display: flex;
  justify-content: space-between;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-top: 1rem;
  font-size: 0.9rem;
`;

const FileName = styled.span`
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 1rem;
`;

const FileSize = styled.span`
  color: ${({ theme }) => theme.textDim};
  flex-shrink: 0;
`;

export default function FileInfo({ file }) {
  return (
    <Wrapper>
      <FileName>{file.name}</FileName>
      <FileSize>{formatSize(file.size)}</FileSize>
    </Wrapper>
  );
}
