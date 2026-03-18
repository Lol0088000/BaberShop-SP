const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DEFAULT_WIDTH = 1800;
const DEFAULT_HEIGHT = 540;
const DEFAULT_QUALITY = 86;

function parseArgs(argv) {
  const options = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    quality: DEFAULT_QUALITY,
    format: 'webp'
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--input' && next) {
      options.input = next;
      index += 1;
      continue;
    }

    if (current === '--output' && next) {
      options.output = next;
      index += 1;
      continue;
    }

    if (current === '--width' && next) {
      options.width = Number(next);
      index += 1;
      continue;
    }

    if (current === '--height' && next) {
      options.height = Number(next);
      index += 1;
      continue;
    }

    if (current === '--quality' && next) {
      options.quality = Number(next);
      index += 1;
      continue;
    }

    if (current === '--format' && next) {
      options.format = String(next).toLowerCase();
      index += 1;
      continue;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    positionals.push(current);
  }

  if (!options.input && positionals[0]) {
    options.input = positionals[0];
  }

  if (!options.output && positionals[1]) {
    options.output = positionals[1];
  }

  return options;
}

function printHelp() {
  console.log('Uso: npm run make:hero -- --input caminho/arquivo.png --output uploads/hero-pronto.webp');
  console.log('');
  console.log('Opcoes:');
  console.log('  --width    Largura do banner final. Padrao: 1800');
  console.log('  --height   Altura do banner final. Padrao: 540');
  console.log('  --quality  Qualidade do arquivo final. Padrao: 86');
  console.log('  --format   webp, jpeg ou png. Padrao: webp');
}

function ensureValidOptions(options) {
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.input) {
    throw new Error('Informe a imagem de entrada com --input.');
  }

  if (!fs.existsSync(options.input)) {
    throw new Error(`Arquivo de entrada nao encontrado: ${options.input}`);
  }

  if (!Number.isFinite(options.width) || options.width < 400) {
    throw new Error('A largura precisa ser um numero maior ou igual a 400.');
  }

  if (!Number.isFinite(options.height) || options.height < 180) {
    throw new Error('A altura precisa ser um numero maior ou igual a 180.');
  }

  if (!Number.isFinite(options.quality) || options.quality < 40 || options.quality > 100) {
    throw new Error('A qualidade precisa ficar entre 40 e 100.');
  }

  if (!['webp', 'jpeg', 'jpg', 'png'].includes(options.format)) {
    throw new Error('Formato invalido. Use webp, jpeg, jpg ou png.');
  }
}

function buildOutputPath(options) {
  if (options.output) {
    return options.output;
  }

  const parsed = path.parse(options.input);
  const ext = options.format === 'jpg' ? 'jpeg' : options.format;
  return path.join(parsed.dir, `${parsed.name}-hero.${ext}`);
}

function createOverlay(width, height) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(8,12,18,0.78)" />
          <stop offset="45%" stop-color="rgba(8,12,18,0.34)" />
          <stop offset="100%" stop-color="rgba(8,12,18,0.18)" />
        </linearGradient>
        <radialGradient id="glow" cx="82%" cy="16%" r="42%">
          <stop offset="0%" stop-color="rgba(197,138,43,0.38)" />
          <stop offset="100%" stop-color="rgba(197,138,43,0)" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#fade)" />
      <rect width="${width}" height="${height}" fill="url(#glow)" />
    </svg>
  `);
}

function createRoundedMask(width, height, radius) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff" />
    </svg>
  `);
}

function createFrame(width, height, radius) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${radius}" ry="${radius}" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="3" />
    </svg>
  `);
}

async function createShadowLayer(canvasWidth, canvasHeight, left, top, width, height, radius) {
  const shadowBase = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="rgba(0,0,0,0.52)" />
    </svg>
  `);

  return sharp(shadowBase).blur(28).png().toBuffer();
}

async function createForeground(inputPath, bannerWidth, bannerHeight) {
  const safePadding = Math.round(Math.min(bannerWidth, bannerHeight) * 0.06);
  const maxWidth = bannerWidth - safePadding * 2;
  const maxHeight = bannerHeight - safePadding * 2;

  const { data, info } = await sharp(inputPath)
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const radius = Math.max(18, Math.round(Math.min(info.width, info.height) * 0.045));
  const mask = createRoundedMask(info.width, info.height, radius);
  const frame = createFrame(info.width, info.height, radius);

  const rounded = await sharp(data)
    .composite([
      { input: mask, blend: 'dest-in' },
      { input: frame }
    ])
    .png()
    .toBuffer();

  return {
    buffer: rounded,
    width: info.width,
    height: info.height,
    radius
  };
}

async function writeOutput(imageBuffer, outputPath, format, quality) {
  const normalized = format === 'jpg' ? 'jpeg' : format;
  const writer = sharp(imageBuffer);

  if (normalized === 'webp') {
    await writer.webp({ quality }).toFile(outputPath);
    return;
  }

  if (normalized === 'jpeg') {
    await writer.jpeg({ quality, mozjpeg: true }).toFile(outputPath);
    return;
  }

  await writer.png({ quality }).toFile(outputPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureValidOptions(options);

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(buildOutputPath(options));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const background = await sharp(inputPath)
    .resize(options.width, options.height, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.82, saturation: 1.02 })
    .blur(24)
    .composite([{ input: createOverlay(options.width, options.height) }])
    .png()
    .toBuffer();

  const foreground = await createForeground(inputPath, options.width, options.height);
  const left = Math.round((options.width - foreground.width) / 2);
  const top = Math.round((options.height - foreground.height) / 2);
  const shadow = await createShadowLayer(
    options.width,
    options.height,
    left,
    top,
    foreground.width,
    foreground.height,
    foreground.radius
  );

  const finalImage = await sharp(background)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: foreground.buffer, left, top }
    ])
    .png()
    .toBuffer();

  await writeOutput(finalImage, outputPath, options.format, options.quality);

  console.log(JSON.stringify({
    input: inputPath,
    output: outputPath,
    width: options.width,
    height: options.height,
    quality: options.quality,
    format: options.format === 'jpg' ? 'jpeg' : options.format
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});