const CustomFilters = {

    INTENSITYALPHA: function (hue: number) {
        return function (context: CanvasRenderingContext2D, callback: () => void) {
            const clearChannel= [[0, 2], [1, 2], [0, 1], [2], [1], [0],];
            const imgData = context.getImageData(
                0, 0, context.canvas.width, context.canvas.height);
            const pixels = imgData.data;
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const v = (r + g + b) / 3;
                pixels[i + 3] = v;

                clearChannel[hue % clearChannel.length].forEach(idx => pixels[i + idx] = 0);
            }
            context.putImageData(imgData, 0, 0);
            callback();
        };
    },
}

export default CustomFilters;
