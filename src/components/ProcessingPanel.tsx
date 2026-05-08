import { AnchorButton, HTMLSelect, NumericInput, ProgressBar } from '@blueprintjs/core';
import React from 'react';

import ViewerManager from '../ViewerManager';

type ProcessingPanelProps = {
  posCount?: number;
  pos?: unknown;
};

class ProcessingPanel extends React.Component<ProcessingPanelProps> {
  constructor(props: ProcessingPanelProps) {
    super(props);
    this.handleSelectProcessing = this.handleSelectProcessing.bind(this);
    this.handleStartProcessing = this.handleStartProcessing.bind(this);
    this.handleSaveProcessedImage = this.handleSaveProcessedImage.bind(this);
  }

  render() {
    const selectProcIndex = ViewerManager.getSelectedProcessorIndex();
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
            disabled={!ViewerManager.isClipSelected() && ViewerManager.isProcessingActive()}
            onClick={this.handleStartProcessing}
          />
          {ViewerManager.hasProcessors() ? (
            <div style={{ width: 160, display: 'inline-block', marginLeft: 24 }}>
              <HTMLSelect
                fill={true}
                onChange={this.handleSelectProcessing}
                disabled={ViewerManager.isProcessingActive()}
                defaultValue={selectProcIndex}
              >
                {ViewerManager.getProcessors().map((p, index) => (
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
            onClick={this.handleSaveProcessedImage}
          />
        </div>
      </div>
    );
  }

  handleSelectProcessing(event: React.ChangeEvent<HTMLSelectElement>) {
    const selectedProcIndex = parseInt(event.currentTarget.value, 10);
    ViewerManager.setSelectedProcessorIndex(selectedProcIndex);
  }

  handleStartProcessing() {
    ViewerManager.performProcessing(ViewerManager.getSelectedProcessorIndex());
  }

  handleSaveProcessedImage() {
    const imageObj = ViewerManager.getProcessedImage();
    if (imageObj) {
      /*
            const link = document.createElement('a');
            link.download = imageObj.name ? imageObj.name + '.png' : 'customprocessing-image.png';
            link.href = imageObj.src;
            link.click();
            */

      //Image was created from blob, hence can not be directly downloaded,
      //thus, we recreate a blob via canvas
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
        //trigger "download" of image
        link.click();
        //Allow download to start before releasing objectUrl
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      });

      /*
            //blob:
            const img = new Image(imageObj);
            img.onload = ()=> {
                link.href = img.src;
                link.click();    
            };
            img.onerror = (e)=> console.error(e);
            */

      /*
            console.log(imageObj.src);
            {
                const newWindow = window.open('', '_blank');
                newWindow.onload = function () {
                    const img = newWindow.document.createElement("img");
                    img.src = imageObj.src;
                };
            }
            */
    }
  }
}

export default ProcessingPanel;
