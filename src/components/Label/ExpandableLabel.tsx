import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { Gradient } from 'src/components/Gradient/Gradient';
import { ExpandButton } from './ExpandButton';
import { Label, Props as LabelProps } from './Label';

type Props = Omit<LabelProps, 'maxHeight'> & {
  onToggleExpand?: (isExpanded: boolean) => void;
  /** Collapsed content height before the expand control appears. */
  collapsedMaxHeight?: number;
  /** Allow the card itself to receive pointer events (2D drag). */
  interactive?: boolean;
  /** Show expand arrow even when collapsed content is not truncated. */
  forceExpandControl?: boolean;
};

const STANDARD_LABEL_HEIGHT = 80;

export const ExpandableLabel = ({
  children,
  onToggleExpand,
  collapsedMaxHeight = STANDARD_LABEL_HEIGHT,
  interactive = false,
  forceExpandControl = false,
  ...rest
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentTruncated, setIsContentTruncated] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const measureTruncation = useCallback(() => {
    const el = contentRef.current;
    if (!el || isExpanded) {
      setIsContentTruncated(false);
      return;
    }
    // scrollHeight reflects full content; clientHeight is capped by maxHeight
    setIsContentTruncated(el.scrollHeight > collapsedMaxHeight - 4);
  }, [isExpanded, collapsedMaxHeight]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;

    measureTruncation();

    const observer = new ResizeObserver(() => {
      measureTruncation();
    });
    observer.observe(el);

    // Quill / markdown may settle after first paint
    const raf = requestAnimationFrame(measureTruncation);
    const t = window.setTimeout(measureTruncation, 100);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [measureTruncation, children]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    measureTruncation();
  }, [isExpanded, measureTruncation]);

  const containerMaxHeight = isExpanded ? undefined : collapsedMaxHeight;
  const showExpandControl =
    isExpanded || isContentTruncated || forceExpandControl;

  return (
    <Label
      {...rest}
      // Keep padding outside the content clamp so margins match isometric.
      maxHeight={undefined}
      maxWidth={isExpanded ? rest.maxWidth * 1.5 : rest.maxWidth}
      sx={{
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'grab' : undefined,
        boxShadow: interactive
          ? '0 4px 14px rgba(15, 23, 42, 0.18)'
          : undefined,
        ...((rest.sx as object) ?? {})
      }}
    >
      <Box
        ref={contentRef}
        sx={{
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }}
        style={{
          overflowY: isExpanded ? 'scroll' : 'hidden',
          maxHeight: containerMaxHeight
        }}
      >
        {children}

        {isContentTruncated && !isExpanded && (
          <Gradient
            sx={{
              position: 'absolute',
              width: '100%',
              height: 50,
              bottom: 0,
              left: 0,
              pointerEvents: 'none'
            }}
          />
        )}
      </Box>

      {showExpandControl && (
        <ExpandButton
          sx={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            m: 0.5,
            pointerEvents: 'auto'
          }}
          isExpanded={isExpanded}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const next = !isExpanded;
            setIsExpanded(next);
            onToggleExpand?.(next);
          }}
        />
      )}
    </Label>
  );
};
