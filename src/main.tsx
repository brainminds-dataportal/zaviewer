//import Normalize CSS before any app components to have it at the beginning of generated css bundle
import 'normalize.css';
import 'react-split-pane/styles.css';

import "@blueprintjs/core/lib/css/blueprint.css";

import * as React from 'react';
import { HotkeysProvider } from "@blueprintjs/core";
import { createRoot } from 'react-dom/client';

import Utils from './Utils';
import { setupLegacyVendors } from "./vendor/setupLegacyVendors";

import App from './components/App';
import { GuidedTour } from "./components/GuidedTour";

await setupLegacyVendors();

declare global {
  interface Window {
    __ZAV_BROWSER_SUPPORTED__?: boolean;
  }
}

const DataVersion_PropName = 'data-dataversion';

/** retrieve configuration ID from url query param  
*/
const getConfigParams = () => {
  const params: { configId?: string, dataSrc?: string, initConfig?: {} } = {};
  const searchParams = new URLSearchParams(location.search);

  const configId = searchParams.get('id');
  if (configId) {
    params.configId = configId;
  }

  const dataSrc = searchParams.get('datasrc');
  if (dataSrc) {
    params.dataSrc = dataSrc;
  }

  if (location.hash) {
    params.initConfig = Utils.getConfigFromLocation(location);
  }
  return params;
}

const parentContainer = document.getElementById('root');
if (parentContainer && window.__ZAV_BROWSER_SUPPORTED__ !== false) {

  //version tag for cache busting
  const dataVersionTag = parentContainer.hasAttribute(DataVersion_PropName)
    ?
    '?ver=' + parentContainer.getAttribute(DataVersion_PropName)
    :
    //by default, no version tag
    ''
    ;

  createRoot(parentContainer).render(
    <React.StrictMode>
      <HotkeysProvider>
        <GuidedTour>
          <App
            //configID is undefined when the viewer is used without backend (i.e. shipped within its dataset)
            {...getConfigParams()}
            dataVersionTag={dataVersionTag}
          />
        </GuidedTour>
      </HotkeysProvider>
    </React.StrictMode>
  );
}
