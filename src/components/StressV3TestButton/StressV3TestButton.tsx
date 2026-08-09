import React, { useCallback, useState } from 'react';
import { Button } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useInitialDataManager } from 'src/hooks/useInitialDataManager';
import { buildStressV3Model } from 'src/fixtures/stressV3Model';

type Props = {
  /** Compact style for sidebar / context panel. */
  fullWidth?: boolean;
  size?: 'small' | 'medium';
};

/**
 * Dev/test control: replaces the project with a ~100-device Plan v3 stress scene
 * (6 switches, 10 VLANs, mixed trunks + access clusters).
 */
export const StressV3TestButton = ({
  fullWidth = true,
  size = 'small'
}: Props) => {
  const { load } = useInitialDataManager();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(() => {
    setBusy(true);
    try {
      load(buildStressV3Model());
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <Button
      size={size}
      variant="outlined"
      color="secondary"
      disabled={busy}
      fullWidth={fullWidth}
      startIcon={<ScienceOutlinedIcon />}
      onClick={onClick}
      title="Generuje ~100 urządzeń: 6 switchy, 94 hosty, 10 VLAN, różne trunki"
      sx={{
        justifyContent: 'flex-start',
        textTransform: 'none',
        fontSize: 12,
        py: 0.5
      }}
    >
      Stress test (100)
    </Button>
  );
};
