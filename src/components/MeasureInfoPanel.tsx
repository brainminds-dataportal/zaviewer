import { AnchorButton } from '@blueprintjs/core';

import ViewerManager from '../ViewerManager';

import './MeasureInfoPanel.scss';

type MeasuredPoint = {
  x: number;
  y: number;
};

type MeasureInfoPanelProps = {
  posCount: number;
  markedPos: MeasuredPoint[];
  markedPosColors: string[];
};

const MeasureInfoPanel = (props: MeasureInfoPanelProps) => {
  let distance = '';
  const posx = ['-', '-'];
  const posy = ['-', '-'];
  const markedPos = props.markedPos;
  for (let i = 0; i < props.posCount; i++) {
    posx[i] = `${markedPos[i].x}.00`.replace(/(\.\d{2}).*$/, '$1');
    posy[i] = `${markedPos[i].y}.00`.replace(/(\.\d{2}).*$/, '$1');
  }
  if (props.posCount === 2) {
    distance =
      `${Math.sqrt((markedPos[0].x - markedPos[1].x) ** 2 + (markedPos[0].y - markedPos[1].y) ** 2)}.00`.replace(
        /(\.\d{2}).*$/,
        '$1',
      );
  }

  const handleClick = () => {
    ViewerManager.setMeasureMode(!ViewerManager.isMeasureModeOn());
  };

  return (
    <div className="distMeasure">
      <div className="posDis" style={props.posCount > 1 ? { color: '#fff' } : {}}>
        <AnchorButton
          title={`${ViewerManager.isMeasureModeOn() ? 'de-' : ''}activate measurement mode`}
          small
          icon="flows"
          intent={ViewerManager.isMeasureModeOn() ? 'primary' : 'none'}
          onClick={handleClick}
        />
        <span style={{ marginLeft: 26 }}>
          Distance:<span className="posdistance">{distance}</span>&nbsp;(mm)
        </span>
      </div>
      <div className="posPoints">
        <div style={props.posCount > 0 ? { color: props.markedPosColors[0] } : {}}>
          <span>P1</span>&nbsp;(<span>{posx[0]}</span>,&nbsp;<span>{posy[0]}</span>)
        </div>
        <div style={props.posCount > 1 ? { color: props.markedPosColors[1] } : {}}>
          <span>P2</span>&nbsp;(<span>{posx[1]}</span>,&nbsp;<span>{posy[1]}</span>)
        </div>
      </div>
    </div>
  );
};

export default MeasureInfoPanel;
