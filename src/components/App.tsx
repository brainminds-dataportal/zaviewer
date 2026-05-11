import { PopoverInteractionKind, PopoverNext, Position, popoverPositionToNextPlacement } from '@blueprintjs/core';
import { createBrowserHistory } from 'history';
import * as React from 'react';

import { Pane, SplitPane } from 'react-split-pane';

const RegionTreePanel = React.lazy(() => import('./RegionTreePanel'));

import axios from 'axios';
import RegionsManager, { type IRegionsPayload, type IRegionsStatus } from '../RegionsManager';
import { RoiInfos } from '../RoiInfo';
import ViewerManager from '../ViewerManager';
import ZAVConfig from '../ZAVConfig';
import { CollapseDirection, DrawerHandle } from './Drawer';
import ViewerComposed from './ViewerComposed';
import type { ZAViewerConfig } from './ViewerPanelTypes';

import './App.scss';
import './Themes.scss';

import { FocusStyleManager } from '@blueprintjs/core';
import { TourContext } from './GuidedTour';

FocusStyleManager.onlyShowFocusOnTabs();

const publicBaseUrl = import.meta.env.BASE_URL;

const history = createBrowserHistory();
const defaultSplitSize = 350;

type AppProps = {
  configId?: string;
  dataSrc?: string;
  dataVersionTag?: string;
  initConfig?: {
    rs?: string;
  };
};

/** Main component of the ZAViewer */
const App = (props: AppProps) => {
  const needsExtraInit = React.useRef(true);

  const [config, setConfig] = React.useState<ZAViewerConfig | undefined>(undefined);
  //display region panel expanded if any region selection specified
  const [isRegPanelExpanded, setIsRegPanelExpanded] = React.useState(Boolean(props?.initConfig?.rs));
  const [splitSize, setSplitSize] = React.useState(defaultSplitSize);

  const [regionsStatus, setRegionsStatus] = React.useState<IRegionsStatus | undefined>(undefined);

  const loadAndInitRegionsTree = React.useCallback(
    (treeDataUrl: string, hasBackend: boolean, hasMultiPlanes: boolean, preselected: string[] | undefined) => {
      axios({
        method: hasBackend ? 'POST' : 'GET',
        url: treeDataUrl,
      })
        .then((response) => {
          const payload: IRegionsPayload = response.data;

          //retrieve region data asynchronously...
          RegionsManager.init(
            payload,
            (newRegionsStatus) => {
              if (needsExtraInit.current && preselected) {
                //Perform the focus on selected region center only once
                needsExtraInit.current = false;

                //Try to switch to center slice of (last) selected region
                const selectedRegion = RegionsManager.getLastSelected();
                if (selectedRegion) {
                  const centerSlice = RegionsManager.getRegionCenterSlice(
                    selectedRegion,
                    hasMultiPlanes,
                    ViewerManager.getActivePlane(),
                  );
                  if (typeof centerSlice !== 'undefined') {
                    ViewerManager.goToSlice(centerSlice);
                  }
                  //display at least regions' border, and labels
                  if (!ViewerManager.isShowingRegions()) {
                    ViewerManager.setBorderDisplay(true);
                  }
                  ViewerManager.setLabelDisplay(true);
                }
              }

              //... and update state after region data change
              setRegionsStatus(newRegionsStatus);
            },
            preselected,
          );
        })
        .catch((error) => {
          // handle error
          console.error(error);
        });
    },
    [],
  );

  const resetRegionsTree = React.useCallback(
    (someConfig?: ZAViewerConfig, preselected?: string[]) => {
      const usedConfig = someConfig || config;
      if (!usedConfig) {
        return;
      }
      //load regions related data
      const treeDataUrl = usedConfig.getTreeDataUrl();
      loadAndInitRegionsTree(treeDataUrl, usedConfig.hasBackend, usedConfig.hasMultiPlanes, preselected);
    },
    [config, loadAndInitRegionsTree],
  );

  React.useEffect(() => {
    //retrieve config asynchronously...
    ZAVConfig.getConfig(props.configId, props.dataSrc, props.dataVersionTag, (newConfig) => {
      setConfig((currentConfig) => (currentConfig === newConfig ? currentConfig : (newConfig as ZAViewerConfig)));
    });
  }, [props.configId, props.dataSrc, props.dataVersionTag]);

  React.useEffect(() => {
    if (!config) {
      return;
    }

    console.info('[ZAV debug] Config loaded', {
      configId: props.configId,
      dataSrc: props.dataSrc,
      dataVersionTag: props.dataVersionTag,
      hasBackend: config?.hasBackend,
      hasCOSource: config?.hasCOSource,
      hasMultiPlanes: config?.hasMultiPlanes,
      firstActivePlane: config?.firstActivePlane,
      slideCounts: {
        axial: config?.axialSlideCount,
        coronal: config?.coronalSlideCount,
        sagittal: config?.sagittalSlideCount,
        total: config?.getTotalSlidesCount?.(),
      },
      publishPath: config?.PUBLISH_PATH,
      iipServerPath: config?.IIPSERVER_PATH,
      volumeUrl: config?.volumeUrl,
      layers: Object.keys(config?.layers || {}),
    });

    const preselected = props?.initConfig?.rs ? String(props?.initConfig?.rs).split(',') : undefined;
    resetRegionsTree(config, preselected);

    RoiInfos.clear();
  }, [config, props.configId, props.dataSrc, props.dataVersionTag, props?.initConfig?.rs, resetRegionsTree]);

  //
  const currentTourStep = React.useContext(TourContext).stepContext?.currentStep;
  const isRegionPanelExpanded =
    currentTourStep && ['_init_', 'mainImagePanel'].includes(currentTourStep)
      ? false
      : currentTourStep === 'expandedRegionPanel'
        ? true
        : isRegPanelExpanded;

  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="App" ref={containerRef}>
      <SplitPane
        direction="horizontal"
        onResize={([primaryPaneSize]) => {
          if (isRegionPanelExpanded) {
            setSplitSize(primaryPaneSize);
          }
        }}
      >
        <Pane size={isRegionPanelExpanded ? splitSize : 0} defaultSize={defaultSplitSize}>
          <div className="secondaryRegionTreePane" style={{ height: '100%', overflow: 'hidden' }}>
            <div id="zav_logoPlaceHolder">
              <div id="zav_logoContainer">
                <div>
                  <a
                    id="bm_logo"
                    href="https://dataportal.brainminds.jp/"
                    title="Click to go to Brain/MINDS dataportal"
                  >
                    <img
                      src={`${publicBaseUrl}img/brain-minds_borderlogo.svg`}
                      alt="Brain/MINDS Data Portal"
                      height={32}
                    />
                  </a>
                </div>
                <div>
                  <img
                    id="zav_logo"
                    src={`${publicBaseUrl}img/logo.png`}
                    alt="ZAViewer"
                    height={23}
                    draggable="false"
                  />
                </div>
                <div style={{ verticalAlign: 'bottom' }}>
                  <div id="zav_BrandingPlaceHolder" style={{ maxWidth: 280, height: 32, overflow: 'clip' }}></div>
                </div>
              </div>
            </div>
            <div id="zav_licensecontainer">
              {config?.extra?.termsOfUse ? (
                <div>
                  <a href={config?.extra?.termsOfUse} target="_blank" rel="noopener">
                    <span className="zav_miscLinks">terms of use</span>
                  </a>
                </div>
              ) : null}
              <PopoverNext
                interactionKind={PopoverInteractionKind.CLICK}
                hasBackdrop={true}
                placement={popoverPositionToNextPlacement(Position.BOTTOM_RIGHT)}
                shouldReturnFocusOnClose={false}
                content={
                  <div style={{ width: '40vw', padding: 20 }}>
                    <h2>Licenses</h2>
                    <p>
                      ZAViewer (this webapp) is licensed under the{' '}
                      <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener">
                        Apache License, Version 2.0
                      </a>
                    </p>
                    <br />
                    <p>
                      This software contains code derived from{' '}
                      <a href="http://openseadragon.github.io" target="_blank" rel="noopener">
                        Openseadragon
                      </a>{' '}
                      v2.4.2 released under the New BSD license.
                    </p>
                    {config?.extra?.hasIIPserver ? (
                      <p>
                        Brain images are served by{' '}
                        <a href="https://iipimage.sourceforge.io/" target="_blank" rel="noopener">
                          IIPImage server
                        </a>
                        , licensed under version 3 of the GNU General Public License.
                      </p>
                    ) : null}
                  </div>
                }
              >
                <div>
                  <span className="zav_miscLinks">licenses</span>
                </div>
              </PopoverNext>
            </div>

            {RegionsManager.isReady() ? (
              <React.Suspense fallback={<div>Loading...</div>}>
                <RegionTreePanel
                  regionsStatus={regionsStatus}
                  hasMultiPlanes={config?.hasMultiPlanes}
                  isVisible={isRegionPanelExpanded}
                />
              </React.Suspense>
            ) : null}
          </div>
        </Pane>
        <Pane>
          <div className="primaryViewerPane" style={{ height: '100%' }}>
            {RegionsManager.isReady() ? (
              <DrawerHandle
                collapseDirection={CollapseDirection.LEFT}
                isExpanded={isRegionPanelExpanded}
                onClick={() => setIsRegPanelExpanded(!isRegionPanelExpanded)}
              />
            ) : null}

            <div style={{ position: 'absolute', left: 13, width: 'calc( 100% - 13px )', height: '100%' }}>
              <ViewerComposed
                containerRef={containerRef}
                config={config}
                regionsStatus={regionsStatus}
                resetRegionsTree={resetRegionsTree}
                history={history}
              />
            </div>
          </div>
        </Pane>
      </SplitPane>
    </div>
  );
};

export default App;
