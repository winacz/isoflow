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

export const useIcon = (id: string | undefined, name?: string) => {
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const icons = useModelStore((state) => {
    return state.icons;
  });

  const icon = useMemo(() => {
    if (!id) return DEFAULT_ICON;

    const shape = SHAPES_2D.find((item) => {
      return item.id === id;
    });

    if (shape) return shape;

    return getItemByIdOrThrow(icons, id).value;
  }, [icons, id]);

  useEffect(() => {
    setHasLoaded(false);
  }, [icon.url]);

  const iconComponent = useMemo(() => {
    if (isShape2dIcon(icon.id)) {
      setHasLoaded(true);
      return <DeviceShape2d shapeId={icon.id} name={name || icon.name} />;
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
  }, [icon, name]);

  return {
    icon,
    iconComponent,
    hasLoaded
  };
};
