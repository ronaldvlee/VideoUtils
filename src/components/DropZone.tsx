import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import styled from 'styled-components';

interface ZoneProps {
  $dragOver: boolean;
}

const Zone = styled.div<ZoneProps>`
  border: 2px dashed ${({ theme, $dragOver }) => ($dragOver ? theme.accent : theme.border)};
  border-radius: 12px;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  background: ${({ $dragOver }) => ($dragOver ? 'rgba(108, 92, 231, 0.05)' : 'transparent')};

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    background: rgba(108, 92, 231, 0.05);
  }

  p {
    color: ${({ theme }) => theme.textDim};
  }
`;

const UploadIcon = styled.svg`
  width: 48px;
  height: 48px;
  color: ${({ theme }) => theme.textDim};
  margin-bottom: 1rem;
`;

const Hint = styled.p`
  font-size: 0.85rem;
  margin-top: 0.25rem;
`;

interface DropZoneProps {
  accept?: string;
  onFile: (file: File) => void;
  validate?: (file: File) => boolean;
  label?: string;
}

export default function DropZone({ accept, onFile, validate, label }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (!validate || validate(file))) {
      onFile(file);
    }
  };

  return (
    <Zone
      $dragOver={dragOver}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <UploadIcon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </UploadIcon>
      <p>{label || 'Drag & drop a file here'}</p>
      <Hint>or click to browse</Hint>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files[0]) onFile(e.target.files[0]);
        }}
      />
    </Zone>
  );
}
