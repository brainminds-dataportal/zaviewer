import OpenSeadragon from 'openseadragon';

import type { RaphaelElementLike } from './viewerTypes';

export type ViewerEventLike = {
  originalEvent?: Event;
  target?: EventTarget | null;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  buttons?: number;
};

export type ViewerMouseTrackerEvent = {
  originalEvent?: MouseEvent | PointerEvent | TouchEvent;
  originalTarget?: Element;
};

export type ViewerRegionListener = {
  dblclick?: (event: ViewerEventLike, target: unknown) => void;
  click: ((event: ViewerEventLike, target: unknown) => void) | Array<(event: ViewerEventLike, target: unknown) => void>;
  mouseover: (event: ViewerEventLike, target: unknown) => void;
  mouseout: (event: ViewerEventLike, target: unknown) => void;
};

export type RegionMouseTracker = OpenSeadragon.MouseTracker & {
  __zavDestroyed?: boolean;
};

export type RegionTrackedElement = Element & {
  __zavRegionMouseTracker?: RegionMouseTracker;
};

export function destroyRegionMouseTracker(targetElement: RegionTrackedElement | null | undefined) {
  if (!targetElement) {
    return;
  }

  const tracker = targetElement.__zavRegionMouseTracker;
  if (!tracker || tracker.__zavDestroyed) {
    targetElement.__zavRegionMouseTracker = undefined;
    return;
  }

  tracker.__zavDestroyed = true;
  targetElement.__zavRegionMouseTracker = undefined;
  tracker.destroy();
}

export function clearRegionMouseTrackers(regionTrackedElements: RegionTrackedElement[]) {
  for (const targetElement of regionTrackedElements) {
    destroyRegionMouseTracker(targetElement);
  }
  return [];
}

export function extendRegionListenerForEdit(
  listener: ViewerRegionListener,
  args: {
    isEditingRegion: () => boolean;
    stopEditingRegion: (event: unknown) => void;
    selectEditRegion: (target: Element) => void;
    isAcquiringRegionToEdit: () => boolean;
    setAcquiringRegionToEdit: (active: boolean) => void;
  },
) {
  const { isAcquiringRegionToEdit, isEditingRegion, selectEditRegion, setAcquiringRegionToEdit, stopEditingRegion } =
    args;
  listener.dblclick = (event: ViewerEventLike) => {
    if (isEditingRegion()) {
      stopEditingRegion(event);
    } else if (event.target instanceof Element) {
      selectEditRegion(event.target);
    }
  };

  const existingClick = listener.click;
  listener.click = [
    ...(Array.isArray(existingClick) ? existingClick : [existingClick]),
    (event: ViewerEventLike) => {
      if (isAcquiringRegionToEdit() && event.target instanceof Element) {
        setAcquiringRegionToEdit(false);
        selectEditRegion(event.target);
      }
    },
  ];

  return listener;
}

export function connectRegionListeners(args: {
  targetElt: unknown;
  regionListener: ViewerRegionListener;
  pathElt?: unknown;
  regionTrackedElements: RegionTrackedElement[];
}) {
  const { pathElt, regionListener, regionTrackedElements, targetElt } = args;
  const maybeRaphaelTarget = targetElt as Partial<RaphaelElementLike>;
  if (typeof maybeRaphaelTarget.mouseover === 'function') {
    const raphaelTarget = targetElt as RaphaelElementLike;
    raphaelTarget.mouseover(function (this: RaphaelElementLike, event: unknown) {
      regionListener.mouseover(event as ViewerEventLike, this);
    });
    raphaelTarget.mouseout(function (this: RaphaelElementLike, event: unknown) {
      regionListener.mouseout(event as ViewerEventLike, this);
    });
    raphaelTarget.click(function (this: RaphaelElementLike, event: unknown) {
      if (Array.isArray(regionListener.click)) {
        for (const clickListener of regionListener.click) {
          clickListener(event as ViewerEventLike, this);
        }
      } else {
        regionListener.click(event as ViewerEventLike, this);
      }
    });
    if (regionListener.dblclick) {
      const dblclickListener = regionListener.dblclick;
      raphaelTarget.dblclick(function (this: RaphaelElementLike, event: unknown) {
        dblclickListener(event as ViewerEventLike, this);
      });
    }
    return;
  }

  const targetElement = targetElt as RegionTrackedElement;
  destroyRegionMouseTracker(targetElement);

  const createViewerEvent = (event: ViewerMouseTrackerEvent): ViewerEventLike => ({
    originalEvent: event.originalEvent,
    target: event.originalTarget ?? event.originalEvent?.target ?? targetElement,
    ctrlKey: Boolean(event.originalEvent?.ctrlKey),
    shiftKey: Boolean(event.originalEvent?.shiftKey),
    buttons: event.originalEvent && 'buttons' in event.originalEvent ? event.originalEvent.buttons : 0,
  });

  const tracker = new OpenSeadragon.MouseTracker({
    element: targetElement,
    overHandler: (event) => {
      regionListener.mouseover(createViewerEvent(event), pathElt);
    },
    outHandler: (event) => {
      regionListener.mouseout(createViewerEvent(event), pathElt);
    },
    clickHandler: (event) => {
      const viewerEvent = createViewerEvent(event);
      if (Array.isArray(regionListener.click)) {
        for (const clickListener of regionListener.click) {
          clickListener(viewerEvent, pathElt);
        }
      } else {
        regionListener.click(viewerEvent, pathElt);
      }
    },
    dblClickHandler: regionListener.dblclick
      ? (event) => {
          regionListener.dblclick?.(createViewerEvent(event), pathElt);
        }
      : undefined,
  }) as RegionMouseTracker;

  tracker.setTracking(true);
  targetElement.__zavRegionMouseTracker = tracker;
  if (!regionTrackedElements.includes(targetElement)) {
    regionTrackedElements.push(targetElement);
  }
}
