export type ViewerRegionInfoLike = {
  pathId: string;
  abbrev?: string;
  regionId?: string;
  fill?: string;
  stroke?: string;
  [key: string]: unknown;
};

export type RaphaelElementLike = {
  id?: string;
  node: SVGGraphicsElement;
  items?: RaphaelElementLike[];
  length?: number;
  [index: number]: SVGGraphicsElement | undefined;
  attr(name: string): string;
  attr(name: string, value: unknown): void;
  attr(attributes: Record<string, unknown>): void;
  click(handler: (event: unknown) => void): void;
  dblclick(handler: (event: unknown) => void): void;
  mouseover(handler: (event: unknown) => void): void;
  mouseout(handler: (event: unknown) => void): void;
};

export type RaphaelSetLike = {
  push(element: RaphaelElementLike): void;
  remove(): void;
  exclude(element: Element): void;
  forEach(callback: (element: RaphaelElementLike) => void): void;
};

export type RaphaelPaperLike = {
  set(): RaphaelSetLike;
  importSVG(element: Element): RaphaelElementLike;
  setTransform(transform: string): void;
};
