// biome-ignore-all lint/a11y/noStaticElementInteractions: The ROI list uses hover-only presentation wrappers and a legacy icon control that will be refactored separately from this lint cleanup.
// biome-ignore-all lint/a11y/useKeyWithClickEvents: Keyboard support for the legacy ROI hover controls requires a larger UX refactor than this lint-focused change.
// biome-ignore-all lint/suspicious/noArrayIndexKey: ROI rows are ordered from stable viewer metadata and currently keyed by list position in legacy UI code.

import { Icon, Switch } from '@blueprintjs/core';
import React from 'react';
import RoiInfos from '../RoiInfo';
import ViewerManager from '../ViewerManager';

import './ROIOptions.scss';
import { PLANE_ABBREVS } from '../ZAVConfig';

type ROIOptionsProps = {
  sliceHasROI: boolean;
  displayROIs: boolean;
};

type ROIOptionsState = {
  hoveredLineNum: number | null;
};

class ROIOptions extends React.Component<ROIOptionsProps, ROIOptionsState> {
  constructor(props: ROIOptionsProps) {
    super(props);
    this.state = { hoveredLineNum: null };

    this.activateROILine = this.activateROILine.bind(this);
    this.handleClickROIsShow = this.handleClickROIsShow.bind(this);
    this.jumpToROICenterSlice = this.jumpToROICenterSlice.bind(this);
  }

  render() {
    return (
      <div style={{ width: 196, marginLeft: 10 }}>
        {RoiInfos.hasROI ? (
          <div>
            <div title="toggle display of ROIs">
              <Switch
                disabled={!this.props.sliceHasROI}
                checked={this.props.displayROIs}
                onChange={this.handleClickROIsShow}
                inline
                label="ROIs"
              />
            </div>
            <div className="zav-roi-list">
              {RoiInfos.getRois().map((r, i) => (
                <div
                  key={i}
                  className={`zav-roi-list-line${this.state.hoveredLineNum === i ? ' zav-roi-line-active' : ''}`}
                  onMouseEnter={() => this.activateROILine(i)}
                  onMouseLeave={() => this.activateROILine(null)}
                >
                  <div className="zav-roi-list-label">{r.roiLabel}</div>
                  <div
                    className="zav-roi-list-button"
                    onClick={() => this.jumpToROICenterSlice(i)}
                    title="Go to center of this ROI"
                  >
                    <Icon icon={'locate'} size={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  activateROILine(roiLineNum: number | null) {
    this.setState({ hoveredLineNum: roiLineNum });
  }

  handleClickROIsShow() {
    ViewerManager.toggleROIDisplay();
  }

  jumpToROICenterSlice(roiLineNum?: number) {
    if (typeof roiLineNum !== 'undefined') {
      const roi = RoiInfos.getRois()[roiLineNum];
      if (roi) {
        let sliceNum: number | undefined;
        if (roi.centerSlices) {
          const activePlane = ViewerManager.getActivePlane();
          const planeAbbrev = PLANE_ABBREVS[activePlane];
          sliceNum = roi.centerSlices[planeAbbrev];
        } else {
          sliceNum = roi.centerSlice;
        }
        if (typeof sliceNum !== 'undefined') {
          ViewerManager.goToSlice(sliceNum, { roiId: roi.roiId });
        }
      }
    }
  }
}

export default ROIOptions;
