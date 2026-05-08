import OpenSeadragon from 'openseadragon';

export const ScalebarType = {
  NONE: 0,
  MICROSCOPY: 1,
  MAP: 2,
} as const;

export const ScalebarLocation = {
  NONE: 0,
  TOP_LEFT: 1,
  TOP_RIGHT: 2,
  BOTTOM_RIGHT: 3,
  BOTTOM_LEFT: 4,
} as const;

type ScalebarTypeValue = (typeof ScalebarType)[keyof typeof ScalebarType];
type ScalebarLocationValue = (typeof ScalebarLocation)[keyof typeof ScalebarLocation];

interface ScalebarMeasurement {
  size: number;
  text: string;
}

type SizeAndTextRenderer = (pixelsPerMeter: number, minSize: number) => ScalebarMeasurement;

interface ZAVScalebarOptions {
  viewer?: OpenSeadragon.Viewer;
  type?: ScalebarTypeValue;
  pixelsPerMeter?: number | null;
  referenceItemIdx?: number;
  minWidth?: string;
  location?: ScalebarLocationValue;
  xOffset?: number;
  yOffset?: number;
  stayInsideImage?: boolean;
  color?: string;
  fontColor?: string;
  backgroundColor?: string;
  fontSize?: string;
  barThickness?: number;
  sizeAndTextRenderer?: SizeAndTextRenderer;
}

declare module 'openseadragon' {
  namespace OpenSeadragon {
    const ScalebarType: typeof import('./openseadragon-scalebar').ScalebarType;
    const ScalebarLocation: typeof import('./openseadragon-scalebar').ScalebarLocation;
    type ScalebarType = ScalebarTypeValue;
    type ScalebarLocation = ScalebarLocationValue;
    interface ScalebarOptions extends ZAVScalebarOptions {}
  }

  interface Viewer {
    scalebar(options?: OpenSeadragon.ScalebarOptions): void;
    scalebarInstance?: Scalebar;
  }
}

class Scalebar {
  private readonly viewer: OpenSeadragon.Viewer;
  private readonly element: HTMLDivElement;
  private controlAnchor: OpenSeadragon.ControlAnchor | null = null;
  private type: ScalebarTypeValue = ScalebarType.MICROSCOPY;
  private pixelsPerMeter: number | null = null;
  private referenceItemIdx = 0;
  private minWidth = '150px';
  private location: ScalebarLocationValue = ScalebarLocation.BOTTOM_LEFT;
  private xOffset = 5;
  private yOffset = 5;
  private stayInsideImage = true;
  private color = 'black';
  private fontColor = 'black';
  private backgroundColor = 'transparent';
  private fontSize = '';
  private barThickness = 2;
  private sizeAndTextRenderer: SizeAndTextRenderer = renderMetricLength;

  constructor(options: OpenSeadragon.ScalebarOptions) {
    if (!options.viewer) {
      throw new Error('A viewer must be specified.');
    }

    this.viewer = options.viewer;
    this.element = document.createElement('div');
    this.element.style.position = 'absolute';
    this.element.style.margin = '0';
    this.element.style.pointerEvents = 'none';
    this.element.style.boxSizing = 'border-box';
    this.element.style.userSelect = 'none';
    this.element.style.whiteSpace = 'nowrap';
    this.element.style.zIndex = '2';

    this.viewer.addHandler('open', this.refresh);
    this.viewer.addHandler('animation', this.refresh);
    this.viewer.addHandler('resize', this.refresh);
    this.viewer.addHandler('close', this.refresh);
    this.viewer.addHandler('before-destroy', this.destroy);

    this.refresh(options);
  }

  refresh = (options?: OpenSeadragon.ScalebarOptions) => {
    this.updateOptions(options);

    if (!this.viewer.isOpen() || this.type === ScalebarType.NONE || !this.location || !this.pixelsPerMeter) {
      this.element.style.display = 'none';
      return;
    }

    this.ensurePlacement();

    const tiledImage = this.getReferenceItem();
    if (!tiledImage) {
      this.element.style.display = 'none';
      return;
    }

    const measuredMinWidth = this.measureMinWidth();
    const currentPixelsPerMeter =
      tiledImage.viewportToImageZoom(this.viewer.viewport.getZoom(true)) * this.pixelsPerMeter;

    if (!Number.isFinite(currentPixelsPerMeter) || currentPixelsPerMeter <= 0) {
      this.element.style.display = 'none';
      return;
    }

    const { size, text } = this.sizeAndTextRenderer(currentPixelsPerMeter, measuredMinWidth);

    if (!Number.isFinite(size) || size <= 0) {
      this.element.style.display = 'none';
      return;
    }

    this.draw(size, text);

    if (this.stayInsideImage) {
      const location = this.getScalebarLocation(tiledImage);
      this.element.style.left = `${location.x}px`;
      this.element.style.top = `${location.y}px`;
    }

    this.element.style.display = 'block';
  };

  destroy = () => {
    this.viewer.removeHandler('open', this.refresh);
    this.viewer.removeHandler('animation', this.refresh);
    this.viewer.removeHandler('resize', this.refresh);
    this.viewer.removeHandler('close', this.refresh);
    this.viewer.removeHandler('before-destroy', this.destroy);
    if (this.controlAnchor !== null) {
      this.viewer.removeControl(this.element);
      this.controlAnchor = null;
    }
    this.viewer.scalebarInstance = undefined;
  };

  private updateOptions(options?: OpenSeadragon.ScalebarOptions) {
    if (!options) {
      return;
    }

    if (typeof options.type !== 'undefined') {
      this.type = options.type;
    }
    if (typeof options.pixelsPerMeter !== 'undefined') {
      this.pixelsPerMeter = options.pixelsPerMeter;
    }
    if (typeof options.referenceItemIdx !== 'undefined') {
      this.referenceItemIdx = options.referenceItemIdx;
    }
    if (typeof options.minWidth !== 'undefined') {
      this.minWidth = options.minWidth;
    }
    if (typeof options.location !== 'undefined') {
      this.location = options.location;
    }
    if (typeof options.xOffset !== 'undefined') {
      this.xOffset = options.xOffset;
    }
    if (typeof options.yOffset !== 'undefined') {
      this.yOffset = options.yOffset;
    }
    if (typeof options.stayInsideImage !== 'undefined') {
      this.stayInsideImage = options.stayInsideImage;
    }
    if (typeof options.color !== 'undefined') {
      this.color = options.color;
    }
    if (typeof options.fontColor !== 'undefined') {
      this.fontColor = options.fontColor;
    }
    if (typeof options.backgroundColor !== 'undefined') {
      this.backgroundColor = options.backgroundColor;
    }
    if (typeof options.fontSize !== 'undefined') {
      this.fontSize = options.fontSize;
    }
    if (typeof options.barThickness !== 'undefined') {
      this.barThickness = options.barThickness;
    }
    if (typeof options.sizeAndTextRenderer !== 'undefined') {
      this.sizeAndTextRenderer = options.sizeAndTextRenderer;
    }
  }

  private getReferenceItem() {
    if (this.referenceItemIdx < 0) {
      return null;
    }
    return this.viewer.world.getItemAt(this.referenceItemIdx) ?? null;
  }

  private measureMinWidth() {
    const previousDisplay = this.element.style.display;
    const previousVisibility = this.element.style.visibility;

    this.element.style.display = 'block';
    this.element.style.visibility = 'hidden';
    this.element.style.width = this.minWidth;

    const measuredMinWidth = Math.max(this.element.offsetWidth, 1);

    this.element.style.visibility = previousVisibility;
    this.element.style.display = previousDisplay;

    return measuredMinWidth;
  }

  private draw(size: number, text: string) {
    this.element.textContent = text;
    this.element.style.width = `${size}px`;
    this.element.style.fontSize = this.fontSize;
    this.element.style.textAlign = 'center';
    this.element.style.color = this.fontColor;
    this.element.style.backgroundColor = this.backgroundColor;
    this.element.style.border = 'none';

    if (this.type === ScalebarType.MAP) {
      this.element.style.borderLeft = `${this.barThickness}px solid ${this.color}`;
      this.element.style.borderRight = `${this.barThickness}px solid ${this.color}`;
      this.element.style.borderBottom = `${this.barThickness}px solid ${this.color}`;
      this.element.style.paddingBottom = '0';
      return;
    }

    this.element.style.borderBottom = `${this.barThickness}px solid ${this.color}`;
  }

  private ensurePlacement() {
    const nextAnchor = this.stayInsideImage ? OpenSeadragon.ControlAnchor.ABSOLUTE : this.getControlAnchor();

    if (this.controlAnchor !== null && this.controlAnchor !== nextAnchor) {
      this.viewer.removeControl(this.element);
      this.controlAnchor = null;
    }

    if (this.controlAnchor === null) {
      this.viewer.addControl(this.element, {
        anchor: nextAnchor,
        autoFade: false,
      });
      this.controlAnchor = nextAnchor;
    }

    this.element.style.marginTop = '';
    this.element.style.marginRight = '';
    this.element.style.marginBottom = '';
    this.element.style.marginLeft = '';

    if (this.stayInsideImage) {
      this.element.style.position = 'absolute';
      return;
    }

    this.element.style.position = 'relative';

    switch (this.location) {
      case ScalebarLocation.TOP_LEFT:
        this.element.style.marginTop = `${this.yOffset}px`;
        this.element.style.marginLeft = `${this.xOffset}px`;
        break;
      case ScalebarLocation.TOP_RIGHT:
        this.element.style.marginTop = `${this.yOffset}px`;
        this.element.style.marginRight = `${this.xOffset}px`;
        break;
      case ScalebarLocation.BOTTOM_RIGHT:
        this.element.style.marginRight = `${this.xOffset}px`;
        this.element.style.marginBottom = `${this.yOffset}px`;
        break;
      default:
        this.element.style.marginBottom = `${this.yOffset}px`;
        this.element.style.marginLeft = `${this.xOffset}px`;
        break;
    }
  }

  private getControlAnchor() {
    switch (this.location) {
      case ScalebarLocation.TOP_LEFT:
        return OpenSeadragon.ControlAnchor.TOP_LEFT;
      case ScalebarLocation.TOP_RIGHT:
        return OpenSeadragon.ControlAnchor.TOP_RIGHT;
      case ScalebarLocation.BOTTOM_RIGHT:
        return OpenSeadragon.ControlAnchor.BOTTOM_RIGHT;
      default:
        return OpenSeadragon.ControlAnchor.BOTTOM_LEFT;
    }
  }

  private getScalebarLocation(tiledImage: OpenSeadragon.TiledImage) {
    const barWidth = this.element.offsetWidth;
    const barHeight = this.element.offsetHeight;
    const containerWidth = this.viewer.container.clientWidth;
    const containerHeight = this.viewer.container.clientHeight;

    let x =
      this.location === ScalebarLocation.TOP_RIGHT || this.location === ScalebarLocation.BOTTOM_RIGHT
        ? containerWidth - barWidth
        : 0;
    let y =
      this.location === ScalebarLocation.BOTTOM_LEFT || this.location === ScalebarLocation.BOTTOM_RIGHT
        ? containerHeight - barHeight
        : 0;

    if (this.stayInsideImage) {
      const imageBounds = this.getImageBoundsInViewer(tiledImage);
      if (imageBounds) {
        if (this.location === ScalebarLocation.TOP_LEFT || this.location === ScalebarLocation.BOTTOM_LEFT) {
          x = Math.max(x, imageBounds.x);
        } else {
          x = Math.min(x, imageBounds.x + imageBounds.width - barWidth);
        }

        if (this.location === ScalebarLocation.TOP_LEFT || this.location === ScalebarLocation.TOP_RIGHT) {
          y = Math.max(y, imageBounds.y);
        } else {
          y = Math.min(y, imageBounds.y + imageBounds.height - barHeight);
        }
      }
    }

    if (this.location === ScalebarLocation.TOP_RIGHT || this.location === ScalebarLocation.BOTTOM_RIGHT) {
      x -= this.xOffset;
    } else {
      x += this.xOffset;
    }

    if (this.location === ScalebarLocation.BOTTOM_LEFT || this.location === ScalebarLocation.BOTTOM_RIGHT) {
      y -= this.yOffset;
    } else {
      y += this.yOffset;
    }

    return new OpenSeadragon.Point(Math.max(x, 0), Math.max(y, 0));
  }

  private getImageBoundsInViewer(tiledImage: OpenSeadragon.TiledImage) {
    const dimensions = tiledImage.source.dimensions;
    if (!dimensions) {
      return null;
    }

    const imageRect = tiledImage.imageToViewportRectangle(0, 0, dimensions.x, dimensions.y);

    return tiledImage.viewportToViewerElementRectangle(imageRect);
  }
}

function renderMetricLength(pixelsPerMeter: number, minSize: number): ScalebarMeasurement {
  const normalizedPixelsPerMeter = normalize(pixelsPerMeter, minSize);
  const size = normalizedPixelsPerMeter * minSize;
  const meters = roundSignificand((normalizedPixelsPerMeter / pixelsPerMeter) * minSize, 3);

  return {
    size,
    text: formatMetricLength(meters),
  };
}

function normalize(pixelsPerMeter: number, minSize: number) {
  const significand = getSignificand(pixelsPerMeter);
  const minSizeSignificand = getSignificand(minSize);
  let result = getSignificand(significand / minSizeSignificand);

  if (result >= 5) {
    result /= 5;
  }
  if (result >= 4) {
    result /= 4;
  }
  if (result >= 2) {
    result /= 2;
  }

  return result;
}

function getSignificand(value: number) {
  return value * 10 ** Math.ceil(-log10(value));
}

function roundSignificand(value: number, decimalPlaces: number) {
  const exponent = -Math.ceil(-log10(value));
  const power = decimalPlaces - exponent;
  const significand = value * 10 ** power;

  if (power < 0) {
    return Math.round(significand) * 10 ** -power;
  }

  return Math.round(significand) / 10 ** power;
}

function log10(value: number) {
  return Math.log(value) / Math.log(10);
}

function formatMetricLength(valueInMeters: number) {
  if (valueInMeters < 0.000001) {
    return `${valueInMeters * 1000000000} nm`;
  }
  if (valueInMeters < 0.001) {
    return `${valueInMeters * 1000000} um`;
  }
  if (valueInMeters < 1) {
    return `${valueInMeters * 1000} mm`;
  }
  if (valueInMeters >= 1000) {
    return `${valueInMeters / 1000} km`;
  }

  return `${valueInMeters} m`;
}

const osdWithScalebar = OpenSeadragon as typeof OpenSeadragon & {
  ScalebarType?: typeof ScalebarType;
  ScalebarLocation?: typeof ScalebarLocation;
};

osdWithScalebar.ScalebarType ??= ScalebarType;
osdWithScalebar.ScalebarLocation ??= ScalebarLocation;

if (!OpenSeadragon.Viewer.prototype.scalebar) {
  OpenSeadragon.Viewer.prototype.scalebar = function scalebar(options: OpenSeadragon.ScalebarOptions = {}) {
    if (!this.scalebarInstance) {
      this.scalebarInstance = new Scalebar({
        ...options,
        viewer: this,
      });
      return;
    }

    this.scalebarInstance.refresh(options);
  };
}
