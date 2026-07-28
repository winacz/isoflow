import React, { useCallback, useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import { Box, Button, Stack, Typography } from '@mui/material';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: number;
  /**
   * `notebook` — tall editor with image/file attach (full device notes).
   * `compact` — small sidebar field (default).
   */
  variant?: 'compact' | 'notebook';
  styles?: React.CSSProperties;
}

const BASIC_TOOLS = ['bold', 'italic', 'underline', 'strike', 'link'];
const NOTEBOOK_FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'bullet',
  'link',
  'image'
];

const MAX_IMAGE_EDGE_PX = 1280;
const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Nie udało się odczytać pliku'));
    };
    reader.readAsDataURL(file);
  });
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error('Nie udało się wczytać obrazu'));
    };
    img.src = src;
  });
};

const compressImageFile = async (file: File): Promise<string> => {
  if (file.type === 'image/svg+xml' || file.size < 180_000) {
    return readFileAsDataUrl(file);
  }

  const raw = await readFileAsDataUrl(file);
  const img = await loadImage(raw);
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE_PX / Math.max(img.width || 1, img.height || 1)
  );
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, width, height);
  const preferPng = file.type === 'image/png' || file.type === 'image/gif';
  return preferPng
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.82);
};

export const MarkdownEditor = ({
  value,
  onChange,
  readOnly,
  height,
  variant = 'compact',
  styles
}: Props) => {
  const quillRef = useRef<ReactQuill | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isNotebook = variant === 'notebook' && !readOnly;
  const editorHeight = height ?? (isNotebook ? 380 : 120);

  const insertAtCursor = useCallback(
    (insert: (editor: any, index: number) => void) => {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;
      const range = editor.getSelection(true);
      const index = range?.index ?? Math.max(0, editor.getLength() - 1);
      insert(editor, index);
      onChange?.(editor.root.innerHTML);
    },
    [onChange]
  );

  const handleImageFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        window.alert('Wybierz plik obrazu (PNG, JPG, GIF, SVG…).');
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        window.alert('Obraz jest za duży (max ~2,5 MB).');
        return;
      }
      try {
        const dataUrl = await compressImageFile(file);
        insertAtCursor((editor, index) => {
          editor.insertEmbed(index, 'image', dataUrl, 'user');
          editor.insertText(index + 1, '\n', 'user');
          editor.setSelection(index + 2, 0);
        });
      } catch {
        window.alert('Nie udało się dodać obrazu.');
      }
      if (imageInputRef.current) imageInputRef.current.value = '';
    },
    [insertAtCursor]
  );

  const handleAttachmentFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      if (file.size > MAX_ATTACHMENT_BYTES) {
        window.alert('Plik jest za duży (max ~2,5 MB).');
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        insertAtCursor((editor, index) => {
          const label = `📎 ${file.name}`;
          editor.insertText(index, label, { link: dataUrl }, 'user');
          editor.insertText(index + label.length, '\n', 'user');
          editor.setSelection(index + label.length + 1, 0);
        });
      } catch {
        window.alert('Nie udało się dodać pliku.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [insertAtCursor]
  );

  const modules = useMemo(() => {
    if (readOnly) return { toolbar: false };

    if (isNotebook) {
      return {
        toolbar: {
          container: [
            [{ header: [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean']
          ],
          handlers: {
            image: () => {
              imageInputRef.current?.click();
            }
          }
        }
      };
    }

    return { toolbar: BASIC_TOOLS };
  }, [isNotebook, readOnly]);

  const formats = isNotebook || readOnly ? NOTEBOOK_FORMATS : BASIC_TOOLS;

  return (
    <Box
      sx={{
        '.ql-toolbar.ql-snow': {
          border: 'none',
          pt: 0,
          px: 0,
          ...(isNotebook
            ? {
                borderBottom: '1px solid',
                borderColor: 'divider',
                mb: 0.5,
                px: 0.5
              }
            : null)
        },
        '.ql-toolbar.ql-snow + .ql-container.ql-snow': {
          border: '1px solid',
          borderColor: 'grey.300',
          borderRadius: 1.5,
          minHeight: editorHeight,
          height: isNotebook ? 'auto' : editorHeight,
          color: 'text.secondary',
          bgcolor: isNotebook ? 'background.paper' : undefined
        },
        '.ql-container.ql-snow': {
          ...(readOnly ? { border: 'none' } : {}),
          ...styles
        },
        '.ql-editor': {
          ...(readOnly ? { p: 0 } : {}),
          ...(isNotebook
            ? {
                minHeight: editorHeight,
                maxHeight: Math.max(480, editorHeight + 120),
                overflowY: 'auto',
                fontSize: 13,
                lineHeight: 1.5
              }
            : null),
          '& img': {
            maxWidth: '100%',
            height: 'auto',
            borderRadius: 4,
            display: 'block',
            my: 1
          }
        }
      }}
    >
      {isNotebook && (
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          sx={{ mb: 0.75 }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<ImageOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => {
              imageInputRef.current?.click();
            }}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            Obraz
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AttachFileOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => {
              fileInputRef.current?.click();
            }}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            Plik / schemat
          </Button>
          <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
            Notatnik urządzenia — tekst, zdjęcia, pliki (max ~2,5 MB)
          </Typography>
        </Stack>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleImageFiles(e.target.files);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          void handleAttachmentFiles(e.target.files);
        }}
      />

      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value ?? ''}
        readOnly={readOnly}
        onChange={onChange}
        formats={formats}
        modules={modules}
      />
    </Box>
  );
};
