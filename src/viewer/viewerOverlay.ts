import Utils from '../Utils';
import ZAVConfig from '../ZAVConfig';

export type ViewerOverlayConfig = {
  PUBLISH_PATH?: string;
  svgFolderName?: string;
  hasMultiPlanes?: boolean;
  dataVersionTag?: string;
};

export function getRegionsSVGUrlForPlaneSlice(config: ViewerOverlayConfig, plane: number, sliceNum: number) {
  return Utils.makePath(
    config.PUBLISH_PATH,
    config.svgFolderName,
    config.hasMultiPlanes ? ZAVConfig.getPlaneName(plane as Parameters<typeof ZAVConfig.getPlaneName>[0]) : undefined,
    `Anno_${sliceNum}.svg${config.dataVersionTag ? config.dataVersionTag : ''}`,
  );
}

export function hasCurrentSliceAtlasRegions(svgFile: XMLDocument, backgroundPathId: string) {
  const root = svgFile.getElementsByTagName('svg')[0];
  if (!root) {
    return false;
  }
  const regionGroup = root.getElementsByTagName('g')[0];
  if (!regionGroup) {
    return false;
  }
  return Array.from(regionGroup.getElementsByTagName('path')).some((pathElement) => {
    const regionId = pathElement.getAttribute('bma:regionId')?.trim() ?? pathElement.getAttribute('id')?.trim() ?? '';
    return regionId !== '' && regionId !== backgroundPathId;
  });
}

export function getCandidatePlaneSlices(planeSlideCount: number, sliceNum: number, distance: number) {
  return [sliceNum - distance, sliceNum + distance].filter(
    (candidateSlice, index, values) =>
      candidateSlice >= 0 && candidateSlice < planeSlideCount && values.indexOf(candidateSlice) === index,
  );
}
