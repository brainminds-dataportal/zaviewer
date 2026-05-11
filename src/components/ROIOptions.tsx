import { Icon, Switch } from '@blueprintjs/core';
import RoiInfos from '../RoiInfo';
import ViewerManager from '../ViewerManager';

import './ROIOptions.scss';
import { PLANE_ABBREVS } from '../ZAVConfig';

type ROIOptionsProps = {
  sliceHasROI: boolean;
  displayROIs: boolean;
};

const ROIOptions = (props: ROIOptionsProps) => {
  const handleClickROIsShow = () => {
    ViewerManager.toggleROIDisplay();
  };

  const jumpToROICenterSlice = (roiLineNum?: number) => {
    if (typeof roiLineNum !== 'undefined') {
      const roi = RoiInfos.getRois()[roiLineNum];
      if (roi) {
        let sliceNum: number | undefined;
        if (roi.centerSlices) {
          const activePlane = ViewerManager.getActivePlane();
          const planeAbbrev = PLANE_ABBREVS[activePlane as keyof typeof PLANE_ABBREVS] as keyof typeof roi.centerSlices;
          sliceNum = roi.centerSlices[planeAbbrev];
        } else {
          sliceNum = roi.centerSlice;
        }
        if (typeof sliceNum !== 'undefined') {
          ViewerManager.goToSlice(sliceNum);
        }
      }
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {RoiInfos.hasROI ? (
        <div>
          <div title="toggle display of ROIs">
            <Switch
              disabled={!props.sliceHasROI}
              checked={props.displayROIs}
              onChange={handleClickROIsShow}
              inline
              label="ROIs"
            />
          </div>
          <div className="zav-roi-list">
            {RoiInfos.getRois().map((r, i) => {
              const roiKey = `${r.roiLabel}-${r.centerSlice ?? 'none'}-${r.centerSlices?.a ?? 'na'}-${r.centerSlices?.c ?? 'nc'}-${r.centerSlices?.s ?? 'ns'}`;
              return (
                <div key={roiKey} className="zav-roi-list-line">
                  <div className="zav-roi-list-label">{r.roiLabel}</div>
                  <button
                    type="button"
                    className="zav-roi-list-button"
                    onClick={() => jumpToROICenterSlice(i)}
                    title="Go to center of this ROI"
                    aria-label={`Go to center of ROI ${r.roiLabel}`}
                    style={{ background: 'none', border: 0, padding: 0 }}
                  >
                    <Icon icon={'locate'} size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ROIOptions;
