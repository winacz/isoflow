import React, { useMemo, useEffect } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useCabinetSnapStore } from 'src/stores/cabinetSnapStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { useScene } from 'src/hooks/useScene';
import { getItemByIdOrThrow } from 'src/utils';
import { IsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/IsometricIcon';
import { NonIsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/NonIsometricIcon';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { ProxmoxNode, buildProxmoxConfig } from 'src/components/Shapes2d/ProxmoxNode';
import { ServerV2Node } from 'src/components/Shapes2d/ServerV2Node/ServerV2Node';
import { CabinetShape2d } from 'src/components/Shapes2d/CabinetShape2d';
import { BlankingPlateShape2d } from 'src/components/Shapes2d/BlankingPlateShape2d';
import { PatchPanelShape2d } from 'src/components/Shapes2d/PatchPanelShape2d';

import {
  DEFAULT_ICON,
  SHAPES_2D,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  CABINET_DEFAULT_UNITS,
  BLANKING_DEFAULT_UNITS,
  PATCH_PANEL_DEFAULT_PORTS,
  isShape2dIcon
} from 'src/config';
import type { ModelItem } from 'src/types';
import { collectOccupiedRackUnits, layoutDeviceTemplate } from 'src/utils';

export const useIcon = (
  id: string | undefined,
  name?: string,
  ports?: ModelItem['ports'],
  connectedPortIds?: ReadonlySet<string> | string[],
  color?: string,
  mismatchPortIds?: ReadonlySet<string> | string[],
  focusedPortIds?: ReadonlySet<string> | string[] | null,
  svis?: ModelItem['svis'],
  rackUnits?: number,
  itemId?: string,
  peerHighlightPortIds?: ReadonlySet<string> | string[],
  attentionPortId?: string | null,
  attentionToken?: number | null,
  vlanBorderColor?: string | null,
  poweredByPoe?: boolean,
  poePowerWarning?: boolean,
  hoveredPortId?: string | null,
  lodSimplified?: boolean
) => {
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const currentViewId = useUiStateStore((state) => state.view);
  const viewItems = useModelStore((state) => {
    const view = state.views.find(v => v.id === currentViewId);
    return view?.items ?? [];
  });
  const deviceTemplates = useModelStore((state) => state.deviceTemplates);
  const { connectors } = useScene();
  const snapCabinetId = useCabinetSnapStore((state) => {
    return state.cabinetId;
  });
  const snapUnit = useCabinetSnapStore((state) => {
    return state.unit;
  });
  const liveMount = useNodeDragStore((state) => {
    return itemId ? state.mounts[itemId] : undefined;
  });

  const occupiedUnits = useMemo(() => {
    if (!itemId) return undefined;
    return Array.from(
      collectOccupiedRackUnits({
        cabinetId: itemId,
        viewItems,
        modelItems
      })
    );
  }, [itemId, viewItems, modelItems]);

  const isMountedInCabinet = useMemo(() => {
    if (!itemId) return false;
    if (liveMount === 'clear') return false;
    if (liveMount && liveMount.parentId) return true;
    const viewItem = viewItems.find((item) => {
      return item.id === itemId;
    });
    return Boolean(viewItem?.parentId);
  }, [itemId, viewItems, liveMount]);

  const icon = useMemo(() => {
    if (!id) return DEFAULT_ICON;

    const shape = SHAPES_2D.find((item) => {
      return item.id === id;
    });

    if (shape) return shape;

    // Custom device templates live in model.icons
    if (isShape2dIcon(id)) {
      const fromIcons = icons.find((item) => {
        return item.id === id;
      });
      if (fromIcons) return fromIcons;
      return {
        id,
        name: name || id,
        url: '',
        collection: 'Switches',
        isIsometric: false
      };
    }

    return getItemByIdOrThrow(icons, id).value;
  }, [icons, id, name]);

  useEffect(() => {
    setHasLoaded(false);
  }, [icon.url]);

  const iconComponent = useMemo(() => {
    if (isShape2dIcon(icon.id)) {
      setHasLoaded(true);

      if (icon.id === SHAPE_2D_CABINET_ID) {
        return (
          <CabinetShape2d
            name={name || icon.name}
            rackUnits={rackUnits ?? CABINET_DEFAULT_UNITS}
            color={color}
            highlightUnit={
              itemId && snapCabinetId === itemId ? snapUnit : null
            }
            occupiedUnits={occupiedUnits}
          />
        );
      }

      if (icon.id === SHAPE_2D_BLANKING_ID) {
        return (
          <BlankingPlateShape2d
            name={name || icon.name}
            rackUnits={rackUnits ?? BLANKING_DEFAULT_UNITS}
            color={color}
            showShadow={!isMountedInCabinet}
          />
        );
      }

      if (icon.id === SHAPE_2D_PATCH_PANEL_ID) {
        const panelItem = itemId
          ? modelItems.find((candidate) => candidate.id === itemId)
          : undefined;
        return (
          <PatchPanelShape2d
            name={name || icon.name}
            portCount={panelItem?.portCount ?? PATCH_PANEL_DEFAULT_PORTS}
            connectedPortIds={connectedPortIds}
            focusedPortIds={focusedPortIds}
            showShadow={!isMountedInCabinet}
            inactive={Boolean(itemId) && !isMountedInCabinet}
          />
        );
      }

      const template = deviceTemplates?.find(t => t.id === icon.id);
      const modelItemForIcon = itemId
        ? modelItems.find((candidate) => candidate.id === itemId)
        : undefined;
      const itemIp = modelItemForIcon?.dhcp
        ? 'DHCP'
        : modelItemForIcon?.ip;
      const itemNodeIcon = modelItemForIcon?.nodeIcon ?? null;
      const itemDescription = modelItemForIcon?.description;

      if (template?.kind === 'SERVER_V2') {
        const layout = layoutDeviceTemplate(template);
        return (
          <ServerV2Node
            jsonText={template.serverV2Json || ''}
            layout={layout}
            shapeId={icon.id}
            itemId={itemId}
            name={name || icon.name}
            ip={itemIp}
            ports={ports}
            svis={svis}
            connectedPortIds={connectedPortIds}
            mismatchPortIds={mismatchPortIds}
            focusedPortIds={focusedPortIds}
            peerHighlightPortIds={peerHighlightPortIds}
            attentionPortId={attentionPortId}
            attentionToken={attentionToken}
            modelItems={modelItems}
            color={color}
            showShadow={!isMountedInCabinet}
            vlanBorderColor={vlanBorderColor}
          />
        );
      }

      if (template?.kind === 'SERVER') {
        const layout = layoutDeviceTemplate(template);
        return (
          <ProxmoxNode
            itemId={itemId}
            config={buildProxmoxConfig(template, layout.ports)}
            size={layout.size}
            layoutPorts={layout.ports}
            name={name || icon.name}
            ip={itemIp}
            connectedPortIds={connectedPortIds}
            focusedPortIds={focusedPortIds}
            peerHighlightPortIds={peerHighlightPortIds}
            attentionPortId={attentionPortId}
            attentionToken={attentionToken}
            showShadow={!isMountedInCabinet}
          />
        );
      }



      return (
        <DeviceShape2d
          itemId={itemId}
          shapeId={icon.id}
          name={name || icon.name}
          ports={ports}
          svis={svis}
          ip={itemIp}
          nodeIcon={itemNodeIcon}
          description={itemDescription}
          connectedPortIds={connectedPortIds}
          mismatchPortIds={mismatchPortIds}
          focusedPortIds={focusedPortIds}
          peerHighlightPortIds={peerHighlightPortIds}
          attentionPortId={attentionPortId}
          attentionToken={attentionToken}
          modelItems={modelItems}
          color={color}
          showShadow={!isMountedInCabinet}
          vlanBorderColor={vlanBorderColor}
          connectors={connectors}
          poweredByPoe={poweredByPoe}
          poePowerWarning={poePowerWarning}
          hoveredPortId={hoveredPortId}
          lodSimplified={lodSimplified}
        />
      );
    }

    if (!icon.isIsometric) {
      setHasLoaded(true);
      return <NonIsometricIcon icon={icon} />;
    }

    return (
      <IsometricIcon
        url={icon.url}
        onImageLoaded={() => {
          setHasLoaded(true);
        }}
      />
    );
  }, [
    icon,
    name,
    ports,
    svis,
    connectedPortIds,
    mismatchPortIds,
    focusedPortIds,
    peerHighlightPortIds,
    attentionPortId,
    attentionToken,
    modelItems,
    color,
    rackUnits,
    itemId,
    snapCabinetId,
    snapUnit,
    occupiedUnits,
    isMountedInCabinet,
    vlanBorderColor,
    poweredByPoe,
    poePowerWarning,
    hoveredPortId,
    lodSimplified,
    connectors,
    deviceTemplates
  ]);

  return {
    icon,
    iconComponent,
    hasLoaded
  };
};
