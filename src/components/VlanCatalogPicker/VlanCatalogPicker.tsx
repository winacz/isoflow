import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getPortStatusColor, normalizeVlanKey } from 'src/utils';

export type VlanCatalogOption = {
  id: string;
  name: string;
};

type Props = {
  label?: string;
  value: string;
  onChange: (vlan: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  /** Show shortcut to IPAM → Vlany. */
  showIpamLink?: boolean;
  fullWidth?: boolean;
  sx?: object;
};

/** Sorted VLAN catalog from committed IPAM → Vlany names. */
export const useVlanCatalogOptions = (): VlanCatalogOption[] => {
  const vlanNames = useModelStore((state) => state.vlanNames ?? {});
  return useMemo(() => {
    return Object.keys(vlanNames)
      .map((id) => ({
        id,
        name: (vlanNames[id] ?? '').trim()
      }))
      .sort(
        (a, b) =>
          Number(a.id) - Number(b.id) ||
          a.id.localeCompare(b.id, undefined, { numeric: true })
      );
  }, [vlanNames]);
};

export const openIpamVlans = (actions: {
  setWorkshopSection: (section: 'templates' | 'ipam') => void;
  setWorkshopIpamTab: (tab: 'devices' | 'vlans' | 'changelog') => void;
  setWorkshopOpen: (open: boolean) => void;
}) => {
  actions.setWorkshopSection('ipam');
  actions.setWorkshopIpamTab('vlans');
  actions.setWorkshopOpen(true);
};

const optionLabel = (opt: VlanCatalogOption) => {
  return opt.name ? `${opt.id} — ${opt.name}` : opt.id;
};

/**
 * Searchable VLAN picker limited to VLANs registered in IPAM → Vlany.
 * Typing a missing id shows „Nie znaleziono”; only catalog matches apply.
 */
export const VlanCatalogPicker = ({
  label = 'VLAN',
  value,
  onChange,
  disabled = false,
  size = 'small',
  showIpamLink = true,
  fullWidth = true,
  sx
}: Props) => {
  const options = useVlanCatalogOptions();
  const uiActions = useUiStateStore((state) => state.actions);

  const catalogMatch = useMemo(() => {
    const key = normalizeVlanKey(value) || value;
    if (!key) return null;
    return (
      options.find((opt) => {
        return opt.id === key;
      }) ?? null
    );
  }, [options, value]);

  const [inputValue, setInputValue] = useState(
    catalogMatch ? optionLabel(catalogMatch) : value || ''
  );

  useEffect(() => {
    setInputValue(catalogMatch ? optionLabel(catalogMatch) : value || '');
  }, [catalogMatch, value]);

  const query = inputValue.trim();
  const queryKey =
    normalizeVlanKey(query.split('—')[0]?.trim()) ||
    normalizeVlanKey(query) ||
    query;
  const inCatalog = options.some((opt) => {
    return opt.id === queryKey;
  });
  const showNotFound = Boolean(queryKey) && !inCatalog;

  return (
    <Stack
      spacing={0.5}
      sx={{ width: fullWidth ? '100%' : undefined, ...(sx as object) }}
    >
      <Stack direction="row" spacing={0.75} alignItems="flex-start">
        <Autocomplete
          disabled={disabled}
          fullWidth={fullWidth}
          size={size}
          options={options}
          value={catalogMatch}
          inputValue={inputValue}
          onInputChange={(_, next, reason) => {
            if (reason === 'reset') return;
            setInputValue(next);
          }}
          onChange={(_, next) => {
            if (!next) return;
            onChange(next.id);
            setInputValue(optionLabel(next));
          }}
          onBlur={() => {
            if (inCatalog && queryKey) {
              if (queryKey !== (normalizeVlanKey(value) || value)) {
                onChange(queryKey);
              }
              const match = options.find((opt) => {
                return opt.id === queryKey;
              });
              setInputValue(match ? optionLabel(match) : queryKey);
              return;
            }
            setInputValue(
              catalogMatch ? optionLabel(catalogMatch) : value || ''
            );
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (!inCatalog || !queryKey) return;
            e.preventDefault();
            onChange(queryKey);
            const match = options.find((opt) => opt.id === queryKey);
            setInputValue(match ? optionLabel(match) : queryKey);
          }}
          getOptionLabel={optionLabel}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(opts, state) => {
            const q = state.inputValue.trim().toLowerCase();
            if (!q) return opts;
            return opts.filter((opt) => {
              return (
                opt.id.toLowerCase().includes(q) ||
                opt.name.toLowerCase().includes(q) ||
                optionLabel(opt).toLowerCase().includes(q)
              );
            });
          }}
          noOptionsText={
            options.length === 0
              ? 'Brak VLAN-ów w IPAM → Vlany'
              : 'Nie znaleziono'
          }
          renderOption={(props, opt) => {
            const color = getPortStatusColor(opt.id);
            const { key, ...rest } = props as typeof props & { key?: string };
            return (
              <Box
                component="li"
                key={key ?? opt.id}
                {...rest}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: '1px solid rgba(0,0,0,0.12)',
                    flexShrink: 0
                  }}
                />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontWeight: 700
                  }}
                >
                  {opt.id}
                </Typography>
                {opt.name ? (
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {opt.name}
                  </Typography>
                ) : null}
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              error={showNotFound}
              helperText={
                options.length === 0
                  ? 'Dodaj VLAN w IPAM → Vlany'
                  : showNotFound
                    ? 'Nie znaleziono w katalogu IPAM'
                    : undefined
              }
            />
          )}
        />
        {showIpamLink && (
          <Button
            size="small"
            variant="outlined"
            title="Otwórz IPAM → Vlany"
            aria-label="Otwórz IPAM → Vlany"
            onClick={() => {
              openIpamVlans(uiActions);
            }}
            sx={{
              minWidth: 36,
              px: 0.75,
              mt: 0.25,
              height: size === 'small' ? 40 : 56
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 18 }} />
          </Button>
        )}
      </Stack>
    </Stack>
  );
};
