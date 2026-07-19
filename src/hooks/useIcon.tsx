import React, { useMemo, useEffect } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { getItemByIdOrThrow } from 'src/utils';
import { IsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/IsometricIcon';
import { NonIsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/NonIsometricIcon';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import {
  DEFAULT_ICON,
  SHAPES_2D,
  isShape2dIcon
} from 'src/config';
import type { ModelItem } from 'src/types';

export const useIcon = (
  id: string | undefined,
  name?: string,
  ports?: ModelItem['ports'],
  connectedPortIds?: ReadonlySet<string> | string[],
  color?: string,
  mismatchPortIds?: ReadonlySet<string> | string[],
  focusedPortId?: string | null
) => {
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });

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
      return (
        <DeviceShape2d
          shapeId={icon.id}
          name={name || icon.name}
          ports={ports}
          connectedPortIds={connectedPortIds}
          mismatchPortIds={mismatchPortIds}
          focusedPortId={focusedPortId}
          modelItems={modelItems}
          color={color}
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
    connectedPortIds,
    mismatchPortIds,
    focusedPortId,
    modelItems,
    color
  ]);

  return {
    icon,
    iconComponent,
    hasLoaded
  };
};
