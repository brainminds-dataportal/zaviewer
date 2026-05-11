import OpenSeadragon from 'openseadragon';

import type { LayerDisplaySetting, LayerDisplaySettings } from './components/ViewerPanelTypes';

type HexColor = string;

type ColorTable = Map<HexColor, string>;

type DrawnTile = {
  bounds: OpenSeadragon.Rect;
  sourceBounds: {
    width: number;
    height: number;
  };
  cacheImageRecord: {
    getRenderedContext(): CanvasRenderingContext2D;
  };
  level: string | number;
};

type DrawnTiledImage = OpenSeadragon.TiledImage & {
  lastDrawn: DrawnTile[];
  _viewportToTiledImageRectangle(rect: OpenSeadragon.Rect): OpenSeadragon.Rect;
  _tileCache: {
    getImageRecord(key: string): { _tiles?: DrawnTile[] } | undefined;
  };
};

class LabelMapper {
  private static LabelColorPattern =
    /^(?<ordnum>\d+)\s+(?<label>[^\s]+)\s+(?<r>\d+)\s+(?<g>\d+)\s+(?<b>\d+)(?:\s+(?<a>\d+))*/;

  static rgbToHexColor(rgb: number[]): HexColor {
    return (
      '#' +
      rgb
        .map((v) => v.toString(16))
        .map((h) => (h.length === 1 ? '0' : '') + h)
        .join('')
    );
  }

  static parseColorTable(data: string): ColorTable {
    //parse color table

    return new Map<HexColor, string>(
      data
        .split('\n')
        .map((line) => {
          const matches = line.match(LabelMapper.LabelColorPattern);
          if (matches) {
            return matches.groups;
          } else return undefined;
        })
        .filter((ll) => typeof ll !== 'undefined')
        .map((ll) => [
          LabelMapper.rgbToHexColor([parseInt(ll?.r, 10), parseInt(ll?.g, 10), parseInt(ll?.b, 10)]),
          ll?.label,
        ]),
    );
  }

  static initLabelMapper(
    viewer: OpenSeadragon.Viewer,
    layerDisplaySettings: LayerDisplaySettings,
    color2labelMap: ColorTable,
    onClassFocused: (color: HexColor | undefined, label?: string) => void,
  ) {
    const labelMapper = new LabelMapper(viewer, layerDisplaySettings, color2labelMap, onClassFocused);

    return typeof labelMapper.mouseTracker !== 'undefined';
  }

  private previousClassColor: string | undefined;
  private mouseTracker: OpenSeadragon.MouseTracker | undefined = undefined;

  private static isDrawnTile(tile: unknown): tile is DrawnTile {
    return (
      typeof tile === 'object' &&
      tile !== null &&
      'bounds' in tile &&
      'sourceBounds' in tile &&
      'cacheImageRecord' in tile
    );
  }

  private constructor(
    viewer: OpenSeadragon.Viewer,
    layerDisplaySettings: LayerDisplaySettings,
    color2labelMap: ColorTable,
    onClassFocused: (color: HexColor | undefined, label?: string) => void,
  ) {
    const labelMapLayer = Object.values(layerDisplaySettings).find(
      (l): l is LayerDisplaySetting & { index: number } => Boolean(l.isLabelMap) && typeof l.index === 'number',
    );
    if (labelMapLayer && color2labelMap) {
      // (see https://github.com/openseadragon/openseadragon/issues/1471#issuecomment-391425270 )
      this.mouseTracker = new OpenSeadragon.MouseTracker({
        element: viewer.element,
        moveHandler: (event) => {
          //find labelMap layer, if any
          const viewportPos = viewer.viewport.pointFromPixel(event.position);
          const tiledImage = viewer.world.getItemAt(labelMapLayer.index) as DrawnTiledImage | undefined;
          if (tiledImage) {
            const labelMapTile = LabelMapper.findLabelMapTile(
              viewer,
              layerDisplaySettings,
              labelMapLayer,
              tiledImage,
              viewportPos,
            );
            if (labelMapTile && LabelMapper.isDrawnTile(labelMapTile)) {
              const rgb = LabelMapper.getPointRGBLabel(labelMapTile, viewportPos);
              if (rgb) {
                const color = LabelMapper.rgbToHexColor(rgb);

                if (color !== this.previousClassColor) {
                  this.previousClassColor = color;
                  const label = color2labelMap.get(color);
                  if (label && onClassFocused) {
                    onClassFocused(color, label);
                  } else {
                    onClassFocused(undefined, undefined);
                    console.log('No label for Color:', color);
                  }
                }
              }
            }
          }
        },
      });
    }
  }

  private static getPointRGBLabel = (labelMapTile: DrawnTile, viewportPos: OpenSeadragon.Point) => {
    //points in the source tile
    const tx = ((viewportPos.x - labelMapTile.bounds.x) / labelMapTile.bounds.width) * labelMapTile.sourceBounds.width;
    const ty =
      ((viewportPos.y - labelMapTile.bounds.y) / labelMapTile.bounds.height) * labelMapTile.sourceBounds.height;
    //get pixel color from cached tile
    const rc = labelMapTile.cacheImageRecord.getRenderedContext();
    const data = rc.getImageData(tx, ty, 1, 1).data;
    return [data[0], data[1], data[2]];
  };

  private static findLabelMapTile = (
    viewer: OpenSeadragon.Viewer,
    layerDisplaySettings: LayerDisplaySettings,
    labelMapLayer: LayerDisplaySetting & { index: number },
    tiledImage: DrawnTiledImage,
    viewportPos: OpenSeadragon.Point,
  ): DrawnTile | undefined => {
    if (labelMapLayer.enabled && labelMapLayer.opacity > 0) {
      //if labelmap layer is visible, can get info directly from lastDrawn
      return (tiledImage.lastDrawn as unknown[]).find(
        (tile): tile is DrawnTile => LabelMapper.isDrawnTile(tile) && tile.bounds.containsPoint(viewportPos),
      );
    }

    //labelmap layer is not visible, first need to find tiles level and coords
    const anyVisibleLayer = Object.values(layerDisplaySettings).find(
      (l): l is LayerDisplaySetting & { index: number } =>
        Boolean(l.enabled) && typeof l.opacity === 'number' && l.opacity > 0 && typeof l.index === 'number',
    );
    if (anyVisibleLayer) {
      //get current title level from lastdrawn on any enabled layer (see https://github.com/openseadragon/openseadragon/issues/1888#issuecomment-1282423960 )
      const visibleTiledImage = viewer.world.getItemAt(anyVisibleLayer.index) as DrawnTiledImage | undefined;
      const coordinates = visibleTiledImage?.lastDrawn.map((item) => parseInt(String(item.level), 10));

      if (!coordinates?.length) {
        return undefined;
      }

      const tileLevel = Math.max(...coordinates);

      // getTileAtPoint technique
      const viewportPosRect = new OpenSeadragon.Rect(viewportPos.x, viewportPos.y, 0, 0);
      const tileSourcePosRect = tiledImage._viewportToTiledImageRectangle(viewportPosRect);
      const tileSourcePos = tileSourcePosRect.getTopLeft();
      const source = tiledImage.source;
      if (
        tileSourcePos.x >= 0 &&
        tileSourcePos.x <= 1 &&
        tileSourcePos.y >= 0 &&
        tileSourcePos.y <= 1 / source.aspectRatio
      ) {
        const tileCoord = source.getTileAtPoint(tileLevel, tileSourcePos);

        //Since labelmap layers' tiles are always loaded, they can be retrieved from tileCache
        const cacheKey = String(tiledImage.source.getTileUrl(tileLevel, tileCoord.x, tileCoord.y));
        const imageRecord = tiledImage._tileCache.getImageRecord(cacheKey);
        const labelMapTile = imageRecord?._tiles?.[0];
        if (labelMapTile && LabelMapper.isDrawnTile(labelMapTile)) {
          return labelMapTile;
        }
      }
    }

    return undefined;
  };
}

export default LabelMapper;
