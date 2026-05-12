import type OpenSeadragon from 'openseadragon';

import type { LayerDisplaySetting } from '../components/ViewerPanelTypes';

type WorldBindingStatus = {
  layerDisplaySettings: Record<string, LayerDisplaySetting>;
};

export function bindViewerWorldItemHandlers(args: {
  viewer: OpenSeadragon.Viewer;
  status: WorldBindingStatus;
  eventSource: OpenSeadragon.EventSource;
  setAllFilters: () => void;
}) {
  const { eventSource, setAllFilters, status, viewer } = args;

  viewer.world.addHandler('add-item', (addItemEvent: OpenSeadragon.AddItemWorldEvent) => {
    const tiledImage = addItemEvent.item as OpenSeadragon.TiledImage;
    for (let i = 0; i < viewer.world.getItemCount(); i++) {
      if (viewer.world.getItemAt(i) === tiledImage) {
        const layer = Object.values(status.layerDisplaySettings).find((candidate) => candidate.index === i);
        if (layer?.isTracer) {
          const handler = (fullyLoadedChangeEvent: { fullyLoaded?: boolean }) => {
            if (fullyLoadedChangeEvent.fullyLoaded) {
              setAllFilters();
              tiledImage.removeHandler('fully-loaded-change', handler);
            }
          };
          tiledImage.addHandler('fully-loaded-change', handler);
        }
        break;
      }
    }
  });

  viewer.world.addHandler('add-item', (addItemEvent: OpenSeadragon.AddItemWorldEvent) => {
    const index = viewer.world.getIndexOfItem(addItemEvent.item);
    const tiledImage = addItemEvent.item as OpenSeadragon.TiledImage;
    const layers = Object.values(status.layerDisplaySettings);
    const layer = index < layers.length ? layers[index] : undefined;
    if (!layer) {
      return;
    }

    eventSource.raiseEvent('zav-layer-loading', { layer: layer.key });
    tiledImage.addHandler('fully-loaded-change', (fullyLoadedChangeEvent: { fullyLoaded?: boolean }) => {
      if (fullyLoadedChangeEvent.fullyLoaded) {
        eventSource.raiseEvent('zav-layer-loaded', { layer: layer.key });
      } else {
        eventSource.raiseEvent('zav-layer-loading', { layer: layer.key });
      }
    });

    if (tiledImage.getFullyLoaded()) {
      eventSource.raiseEvent('zav-layer-loaded', { layer: layer.key });
    }
  });
}
