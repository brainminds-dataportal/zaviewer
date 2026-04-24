import OpenSeadragon from "openseadragon";
import "openseadragon-filtering";
import "@openseadragon-imaging/openseadragon-viewerinputhook";

type LegacyWindow = Window &
  typeof globalThis & {
    OpenSeadragon?: typeof OpenSeadragon;
    Raphael?: unknown;
  };

function patchReferenceStripFocus(osd: typeof OpenSeadragon) {
  const referenceStripPrototype = (osd as typeof OpenSeadragon & {
    ReferenceStrip?: { prototype?: { setFocus?: (page: number | string) => void } };
  }).ReferenceStrip?.prototype;

  if (!referenceStripPrototype?.setFocus || "__zavPatchedSetFocus" in referenceStripPrototype) {
    return;
  }

  const originalSetFocus = referenceStripPrototype.setFocus;

  referenceStripPrototype.setFocus = function patchedSetFocus(page: number | string) {
    const previousPage = (this as { currentPage?: number | string }).currentPage;
    originalSetFocus.call(this, page);
    (this as { currentPage?: number | string }).currentPage = previousPage;
  };

  Object.defineProperty(referenceStripPrototype, "__zavPatchedSetFocus", {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export async function setupLegacyVendors() {
  const legacyWindow = window as LegacyWindow;

  legacyWindow.OpenSeadragon = OpenSeadragon;

  patchReferenceStripFocus(OpenSeadragon);

  await import("./openseadragon-scalebar.js");
}
