import { VolumeRenderer } from "@brainminds-dataportal/vol-renderer"

import "@brainminds-dataportal/vol-renderer/dist/main.css";

const VolumeView = (props: { url: string }) => {
    return (
        <VolumeRenderer
            url={props.url}
            inlineControls={true}
        />
    );
}

export default VolumeView;
