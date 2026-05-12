type RgbaColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

let cachedColorContext: CanvasRenderingContext2D | null | undefined;

function getColorContext() {
  if (typeof cachedColorContext !== 'undefined') {
    return cachedColorContext;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  cachedColorContext = canvas.getContext('2d');
  return cachedColorContext;
}

function parseHexColor(color: string): RgbaColor {
  const hex = color.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    const [red, green, blue, alpha = 'f'] = hex.split('');
    return {
      red: Number.parseInt(`${red}${red}`, 16),
      green: Number.parseInt(`${green}${green}`, 16),
      blue: Number.parseInt(`${blue}${blue}`, 16),
      alpha: Number.parseInt(`${alpha}${alpha}`, 16) / 255,
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  throw new Error(`Unsupported hex color: ${color}`);
}

function parseRgbColor(color: string): RgbaColor {
  const rgbMatch = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgbMatch) {
    throw new Error(`Unsupported rgb color: ${color}`);
  }

  const [, red, green, blue, alpha] = rgbMatch;
  return {
    red: Number(red),
    green: Number(green),
    blue: Number(blue),
    alpha: alpha ? Number(alpha) : 1,
  };
}

function parseCssColor(color: string): RgbaColor {
  const context = getColorContext();
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  context.fillStyle = '#000000';
  context.fillStyle = color;
  const normalizedColor = context.fillStyle.toString();

  if (normalizedColor.startsWith('#')) {
    return parseHexColor(normalizedColor);
  }

  if (normalizedColor.startsWith('rgb')) {
    return parseRgbColor(normalizedColor);
  }

  throw new Error(`Unsupported color format: ${normalizedColor}`);
}

export function invertCssColor(color: string) {
  const parsedColor = parseCssColor(color);
  const red = 255 - parsedColor.red;
  const green = 255 - parsedColor.green;
  const blue = 255 - parsedColor.blue;

  if (parsedColor.alpha < 1) {
    return `rgba(${red}, ${green}, ${blue}, ${parsedColor.alpha})`;
  }

  return `rgb(${red}, ${green}, ${blue})`;
}
