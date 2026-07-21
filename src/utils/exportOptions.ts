import domtoimage from 'dom-to-image';
import FileSaver from 'file-saver';
import { Size } from '../types';
import type { ExportSnapshot } from './model';

export const generateGenericFilename = (extension: string) => {
  return `isoflow-export-${new Date().toISOString()}.${extension}`;
};

/** Safe download name from project title, e.g. "IDF Core" → "IDF-Core.json". */
export const generateProjectFilename = (title: string, extension = 'json') => {
  const slug = (title || 'Untitled project')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const safe = slug || 'Untitled-project';
  return `${safe}.${extension}`;
};

export const base64ToBlob = (
  base64: string,
  contentType: string,
  sliceSize = 512
) => {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });

  return blob;
};

export const downloadFile = (data: Blob, filename: string) => {
  FileSaver.saveAs(data, filename);
};

export const exportAsJSON = (snapshot: ExportSnapshot, filename?: string) => {
  const data = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  downloadFile(data, filename || generateGenericFilename('json'));
};

export const exportAsImage = async (el: HTMLDivElement, size?: Size) => {
  const imageData = await domtoimage.toPng(el, {
    ...size,
    cacheBust: true
  });

  return imageData;
};
