import React from 'react';

import ViewerManager from '../ViewerManager'

import "./OSDMain.scss";

class OSDMain extends React.Component {
    render() {
        return (
            <div id={ViewerManager.VIEWER_ID} className="openseadragon"></div>
        );
    }

}

export default OSDMain;
