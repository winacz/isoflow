// Dev-mode entry: mounts the editor directly (no examples switcher).
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider, createTheme, Box } from '@mui/material';
import Isoflow from './Isoflow';
import { createEditorInitialData } from './examples/createEditorInitialData';
import { themeConfig } from './styles/theme';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const App = () => {
  const initialData = useMemo(() => {
    return createEditorInitialData();
  }, []);

  // Isoflow uses height/width 100% — needs a real viewport-sized parent
  // (the old Examples switcher provided 100vw×100vh; without it the canvas
  // collapses to 0×0 and fit-to-view zooms to ~5%).
  return (
    <Box sx={{ width: '100vw', height: '100vh' }}>
      <Isoflow initialData={initialData} />
    </Box>
  );
};

root.render(
  <React.StrictMode>
    <GlobalStyles
      styles={{
        html: { height: '100%' },
        body: {
          margin: 0,
          height: '100%',
          overflow: 'hidden'
        },
        '#root': { height: '100%' }
      }}
    />
    <ThemeProvider theme={createTheme({ ...themeConfig, palette: {} })}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
