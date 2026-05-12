export type ViewerMeasurementConfig = {
  imageSize: number;
  matrix?: number[] | null;
};

export function getPhysicalPoint(
  config: ViewerMeasurementConfig,
  planeSlice: number,
  planeSliceStep: number,
  x: number,
  y: number,
) {
  const tx = config.imageSize - x;
  const ty = config.imageSize - y;
  const point = [tx, planeSlice * planeSliceStep, ty, 1];
  const result = [0, 0, 0, 0];
  const matrix = config.matrix ?? [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i] += (matrix[i * 4 + j] ?? 0) * point[j];
    }
  }
  return result;
}

export function getPhysicalPointXY(
  config: ViewerMeasurementConfig,
  planeSlice: number,
  planeSliceStep: number,
  x: number,
  y: number,
) {
  const pos = getPhysicalPoint(config, planeSlice, planeSliceStep, x, y);
  return { x: pos[0], y: pos[2] };
}
