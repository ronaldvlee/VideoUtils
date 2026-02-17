import { useState } from 'react';

interface UseFileListOptions {
  validate?: (file: File) => boolean;
}

export function useFileList(options?: UseFileListOptions) {
  const [files, setFiles] = useState<File[]>([]);

  const addFiles = (newFiles: File[]) => {
    const filtered = options?.validate ? newFiles.filter(options.validate) : newFiles;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const unique = filtered.filter((f) => !existing.has(`${f.name}:${f.size}`));
      return [...prev, ...unique];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  return { files, addFiles, removeFile, clearFiles };
}
