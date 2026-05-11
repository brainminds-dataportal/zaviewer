import './PositionInfoPanel.scss';

type PositionInfoPanelProps = {
  livePosition?: [number, number, number] | number[];
};

const PositionInfoPanel = (props: PositionInfoPanelProps) => {
  let posX: string;
  let posY: string;
  let posZ: string;
  if (props.livePosition) {
    posX = props.livePosition[0].toFixed(2);
    posY = props.livePosition[1].toFixed(2);
    posZ = props.livePosition[2].toFixed(2);
  } else {
    posX = posY = posZ = '-';
  }

  return (
    <div className="posviewPanel posTbl">
      <div>
        <div className="posLabel"> x ( - Left, + Right)</div>
        <div>:</div>
        <div className="posValue">{posX}</div>
      </div>
      <div>
        <div className="posLabel">y ( - Posterior, + Anterior)</div>
        <div>:</div>
        <div className="posValue">{posY}</div>
      </div>
      <div>
        <div className="posLabel">z ( - Inferior, + Superior)</div>
        <div>:</div>
        <div className="posValue">{posZ}</div>
      </div>
    </div>
  );
};

export default PositionInfoPanel;
