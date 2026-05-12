import Raphael from 'raphael';
import 'raphael-svg-import-classic';

type RaphaelContainerConfig = {
  container?: Element | number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type RaphaelPaperInstance = {
  width: number;
  height: number;
  canvas: SVGElement;
  _left: number;
  _top: number;
  clear(): void;
  renderfix(): void;
};

type RaphaelPaperPrototype = {
  renderfix?: () => void;
  setTransform?: (transform: string) => void;
  __zavPatchedRenderfix?: boolean;
  __zavPatchedSetTransform?: boolean;
};

type RaphaelStaticWithInternals = typeof Raphael & {
  _engine?: {
    create?: (...args: unknown[]) => RaphaelPaperInstance;
    __zavPatchedCreate?: boolean;
  };
  _Paper?: new () => RaphaelPaperInstance;
  _getContainer?: (...args: unknown[]) => RaphaelContainerConfig | null | undefined;
  _g?: { doc: Document };
  fn: RaphaelPaperPrototype;
};

type LegacyWindow = Window &
  typeof globalThis & {
    Raphael?: typeof Raphael;
  };

function createSvgNode<T extends keyof SVGElementTagNameMap>(doc: Document, tagName: T) {
  return doc.createElementNS('http://www.w3.org/2000/svg', tagName);
}

function patchCreate(raphael: RaphaelStaticWithInternals) {
  const engine = raphael._engine;
  const getContainer = raphael._getContainer;
  const Paper = raphael._Paper;
  const doc = raphael._g?.doc;
  if (!engine || !getContainer || !Paper || !doc || engine.__zavPatchedCreate) {
    return;
  }

  engine.create = (...args: unknown[]) => {
    const con = getContainer(...args);
    const host = con?.container;
    if (!host) {
      throw new Error('SVG container not found.');
    }

    const x = con.x ?? 0;
    const y = con.y ?? 0;
    const width = con.width ?? 512;
    const height = con.height ?? 342;
    const svg = createSvgNode(doc, 'svg');
    const group = createSvgNode(doc, 'g');
    const css = 'overflow:hidden;';

    svg.setAttribute('height', String(height));
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', String(width));
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.appendChild(group);
    (group.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor =
      'rgba(0,0,0,0)';

    let isFloating = false;
    if (host === 1) {
      svg.style.cssText = `${css}position:absolute;left:${x}px;top:${y}px`;
      doc.body.appendChild(svg);
      isFloating = true;
    } else if (host instanceof Element) {
      svg.style.cssText = `${css}position:relative`;
      if (host.firstChild) {
        host.insertBefore(svg, host.firstChild);
      } else {
        host.appendChild(svg);
      }
    }

    const paper = new Paper();
    paper.width = width;
    paper.height = height;
    paper.canvas = group;
    paper.clear();
    paper._left = 0;
    paper._top = 0;
    if (isFloating) {
      paper.renderfix = () => {};
    }
    paper.renderfix();
    return paper;
  };

  Object.defineProperty(engine, '__zavPatchedCreate', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

function patchRenderfix(raphael: RaphaelStaticWithInternals) {
  const paperPrototype = raphael.fn as RaphaelPaperPrototype;
  const originalRenderfix = paperPrototype.renderfix;
  if (!originalRenderfix || paperPrototype.__zavPatchedRenderfix) {
    return;
  }

  paperPrototype.renderfix = function patchedRenderfix(this: RaphaelPaperInstance) {
    const canvas = this.canvas;
    const style = canvas.style;
    let matrix: DOMMatrix | SVGMatrix;
    try {
      const graphicsCanvas = canvas as SVGGraphicsElement;
      const matrixHost = graphicsCanvas.ownerSVGElement;
      matrix = graphicsCanvas.getScreenCTM() ?? matrixHost?.createSVGMatrix() ?? new DOMMatrix();
    } catch {
      matrix = new DOMMatrix();
    }

    const left = -matrix.e % 1;
    const top = -matrix.f % 1;
    if (left) {
      this._left = (this._left + left) % 1;
      style.left = `${this._left}px`;
    }
    if (top) {
      this._top = (this._top + top) % 1;
      style.top = `${this._top}px`;
    }
  };

  Object.defineProperty(paperPrototype, '__zavPatchedRenderfix', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

function patchSetTransform(raphael: RaphaelStaticWithInternals) {
  const paperPrototype = raphael.fn as RaphaelPaperPrototype;
  if (paperPrototype.__zavPatchedSetTransform) {
    return;
  }

  paperPrototype.setTransform = function setTransform(this: RaphaelPaperInstance, transform: string) {
    this.canvas.setAttribute('transform', transform);
  };

  Object.defineProperty(paperPrototype, '__zavPatchedSetTransform', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export function setupRaphael() {
  const legacyWindow = window as LegacyWindow;
  legacyWindow.Raphael = Raphael;

  const raphael = Raphael as RaphaelStaticWithInternals;
  patchCreate(raphael);
  patchRenderfix(raphael);
  patchSetTransform(raphael);

  return Raphael;
}

export default setupRaphael();
