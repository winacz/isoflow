import React, { useMemo } from 'react';
import Isoflow from 'src/Isoflow';
import { createEditorInitialData } from '../createEditorInitialData';

export const BasicEditor = () => {
  const initialData = useMemo(() => {
    return createEditorInitialData();
  }, []);

  return <Isoflow initialData={initialData} />;
};
