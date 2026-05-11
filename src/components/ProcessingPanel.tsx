import { AnchorButton, HTMLSelect, NumericInput, ProgressBar } from '@blueprintjs/core';
import type React from 'react';

import ViewerManager from '../ViewerManager';

type ProcessingPanelProps = {
  posCount?: number;
  pos?: unknown;
};

const ProcessingPanel = (_props: ProcessingPanelProps) => {
  const selectProcIndex = ViewerManager.getSelectedProcessorIndex();

  const handleSelectProcessing = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedProcIndex = parseInt(event.currentTarget.value, 10);
    ViewerManager.setSelectedProcessorIndex(selectedProcIndex);
  };

  const handleStartProcessing = () => {
    ViewerManager.performProcessing(ViewerManager.getSelectedProcessorIndex());
  };

  const handleSaveProcessedImage = () => {
    const imageObj = ViewerManager.getProcessedImage();
    if (imageObj) {
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = imageObj.width;
      tmpCanvas.height = imageObj.height;
      const tmpContext = tmpCanvas.getContext('2d');
      if (!tmpContext) {
        return;
      }
      tmpContext.drawImage(imageObj, 0, 0);
      tmpCanvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = imageObj.name ? `${imageObj.name}.png` : 'customprocessing-image.png';
        link.href = blobUrl;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      });
    }
  };

  return (
    <div>
      <div>
        <AnchorButton
          title={`${ViewerManager.isZoomEnabled() ? 'de-' : ''}activate zooming`}
          small
          icon="zoom-in"
          intent={ViewerManager.isZoomEnabled() ? 'primary' : 'none'}
          onClick={() => ViewerManager.setZoomEnabled(!ViewerManager.isZoomEnabled())}
        />
        <div style={{ width: 160, display: 'inline-block', marginLeft: 24 }}>
          <NumericInput
            fill={true}
            leftIcon="percentage"
            disabled={!ViewerManager.isZoomEnabled()}
            value={Number(ViewerManager.getZoomFactor()).toFixed(0)}
            min={1}
            max={600}
            minorStepSize={1}
            majorStepSize={10}
            onValueChange={(valueAsNumber, _valueAsString) => ViewerManager.setZoomFactor(valueAsNumber)}
            asyncControl={true}
          />
        </div>
      </div>
      <div>
        <AnchorButton
          title={`${ViewerManager.isSelectClipModeOn() ? 'de-' : ''}activate clip selection for processing`}
          small
          icon="select"
          intent={ViewerManager.isSelectClipModeOn() ? 'primary' : 'none'}
          onClick={() => ViewerManager.setSelectClip(!ViewerManager.isSelectClipModeOn())}
        />
      </div>
      <div>
        <div style={{ height: 5, margin: '5px 0' }}>
          {ViewerManager.isProcessingActive() ? <ProgressBar className="zav-thinProgressBar" /> : null}
        </div>
        <AnchorButton
          title={'perform processing on selected clip'}
          small
          icon="derive-column"
          disabled={!ViewerManager.isClipSelected() || ViewerManager.isProcessingActive()}
          onClick={handleStartProcessing}
        />
        {ViewerManager.hasProcessors() ? (
          <div style={{ width: 160, display: 'inline-block', marginLeft: 24 }}>
            <HTMLSelect
              fill={true}
              onChange={handleSelectProcessing}
              disabled={Boolean(ViewerManager.isProcessingActive())}
              defaultValue={String(selectProcIndex)}
            >
              {ViewerManager.getProcessors().map((p: { name: string }, index: number) => (
                <option key={p.name} value={index}>
                  {p.name}
                </option>
              ))}
            </HTMLSelect>
          </div>
        ) : null}
        <AnchorButton
          title={'save result image'}
          small
          icon="floppy-disk"
          disabled={!ViewerManager.getProcessedImage()}
          onClick={handleSaveProcessedImage}
        />
      </div>
    </div>
  );
};

export default ProcessingPanel;
