import QRCode from 'qrcode';
import type { PublicLetterDTO } from '../shared/types.ts';

export type CardFormat = 'full' | 'excerpt';
export type CardTemplate = 'editorial' | 'monochrome' | 'stationery';
export type CardVariant = 'light' | 'dark';

export interface TextMeasurer {
  measureWidth(text: string, font: string): number;
}

export interface RenderedPageAsset {
  pageNumber: number;
  totalPages: number;
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
}

export interface CardLineItem {
  text: string;
  y: number;
}

export interface PlannedCardPage {
  pageNumber: number;
  isFirstPage: boolean;
  metaLine: string | null;
  titleLines: CardLineItem[];
  bodyLines: CardLineItem[];
}

export interface CardRenderOptions {
  letter: PublicLetterDTO;
  format: CardFormat;
  template: CardTemplate;
  variant: CardVariant;
  includeCategory: boolean;
  includeQr: boolean;
  excerptText?: string;
  shareUrl: string;
}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT_FULL = 1350;
export const CARD_HEIGHT_EXCERPT = 1080;
export const CARD_SCALE = 2;
export const MAX_EXPORT_PAGES = 80;

const EMOJI_SAFE_SANS =
  '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const EMOJI_SAFE_SERIF =
  '"Cormorant Garamond", Georgia, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';

export const CARD_FONTS = {
  brand: `600 32px ${EMOJI_SAFE_SERIF}`,
  category: `500 20px ${EMOJI_SAFE_SANS}`,
  meta: `500 20px ${EMOJI_SAFE_SANS}`,
  title: `600 44px ${EMOJI_SAFE_SERIF}`,
  bodyFull: `400 30px ${EMOJI_SAFE_SANS}`,
  bodyExcerpt: `italic 400 40px ${EMOJI_SAFE_SERIF}`,
  pageNumber: `600 17px ${EMOJI_SAFE_SANS}`,
  tagline: `italic 400 24px ${EMOJI_SAFE_SERIF}`,
};

export interface CardMetrics {
  width: number;
  height: number;
  contentX: number;
  contentWidth: number;
  headerRuleY: number;
  footerRuleY: number;
  maxBaselineY: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  paragraphGap: number;
  lineBreakGap: number;
  continuationStartY: number;
  firstPageIntroY: number;
}

export function getCardMetrics(format: CardFormat): CardMetrics {
  const width = CARD_WIDTH;
  const height = format === 'excerpt' ? CARD_HEIGHT_EXCERPT : CARD_HEIGHT_FULL;
  const contentX = 100;
  const contentWidth = width - contentX * 2;
  const headerRuleY = 152;
  const footerRuleY = height - 168;
  const maxBaselineY = footerRuleY - 34;

  return {
    width,
    height,
    contentX,
    contentWidth,
    headerRuleY,
    footerRuleY,
    maxBaselineY,
    titleLineHeight: 52,
    bodyLineHeight: format === 'excerpt' ? 56 : 46,
    paragraphGap: format === 'excerpt' ? 24 : 24,
    lineBreakGap: format === 'excerpt' ? 10 : 6,
    continuationStartY: 214,
    firstPageIntroY: 202,
  };
}

export function formatCardDate(iso: string | null): string {
  if (!iso) return 'Draft';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Draft';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function splitIntoGraphemes(input: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const SegmenterCtor = (
      Intl as unknown as {
        Segmenter: new (
          locale?: string,
          opts?: { granularity: 'grapheme' }
        ) => { segment: (s: string) => Iterable<{ segment: string }> };
      }
    ).Segmenter;
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(input), (item) => item.segment);
  }
  return Array.from(input);
}

/**
 * Wraps a single paragraph without ever dropping text or splitting normal words
 * mid-word. Only if a single unbroken token itself is wider than maxWidth does
 * it break across grapheme clusters so no text overflows card edges.
 */
export function wrapSingleParagraph(
  measurer: TextMeasurer,
  paragraph: string,
  font: string,
  maxWidth: number
): string[] {
  const words = paragraph.trim().split(/[ \t]+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measurer.measureWidth(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (measurer.measureWidth(word, font) <= maxWidth) {
      current = word;
      continue;
    }

    // Oversized unbroken token: wrap cleanly on grapheme boundaries
    const graphemes = splitIntoGraphemes(word);
    let chunk = '';
    for (const g of graphemes) {
      const nextChunk = chunk + g;
      if (chunk && measurer.measureWidth(nextChunk, font) > maxWidth) {
        lines.push(chunk);
        chunk = g;
      } else {
        chunk = nextChunk;
      }
    }
    current = chunk;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

interface ParagraphBlock {
  lines: string[];
  hasBlankGapBefore: boolean;
}

function parseParagraphBlocks(
  measurer: TextMeasurer,
  rawText: string,
  font: string,
  maxWidth: number
): ParagraphBlock[] {
  const normalized = rawText.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  const blocks: ParagraphBlock[] = [];
  let pendingBlankGap = false;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      if (blocks.length > 0) {
        pendingBlankGap = true;
      }
      continue;
    }

    const wrapped = wrapSingleParagraph(measurer, trimmed, font, maxWidth);
    if (wrapped.length > 0) {
      blocks.push({
        lines: wrapped,
        hasBlankGapBefore: pendingBlankGap,
      });
      pendingBlankGap = false;
    }
  }

  return blocks;
}

export function planCardPages(
  measurer: TextMeasurer,
  options: Pick<CardRenderOptions, 'letter' | 'format' | 'excerptText'>
): PlannedCardPage[] {
  const { letter, format, excerptText } = options;
  const metrics = getCardMetrics(format);
  const bodyFont = format === 'excerpt' ? CARD_FONTS.bodyExcerpt : CARD_FONTS.bodyFull;

  // Build Page 1 introductory block for Full Letter format
  let metaLine: string | null = null;
  const titleLines: CardLineItem[] = [];
  let pageOneBodyStartY = metrics.continuationStartY;

  if (format === 'full') {
    const dateLabel = formatCardDate(letter.publishedAt || letter.createdAt);
    metaLine = `By ${letter.authorDisplayName} · ${dateLabel}`;

    let cursorY = metrics.firstPageIntroY + 46;
    const cleanTitle = (letter.title || '').trim();
    if (cleanTitle) {
      const wrappedTitle = wrapSingleParagraph(
        measurer,
        cleanTitle,
        CARD_FONTS.title,
        metrics.contentWidth
      );
      for (const tLine of wrappedTitle) {
        titleLines.push({ text: tLine, y: cursorY });
        cursorY += metrics.titleLineHeight;
      }
      cursorY += 20;
    }
    pageOneBodyStartY = Math.max(metrics.continuationStartY, cursorY);
  }

  const rawBody =
    format === 'excerpt'
      ? `“${(excerptText ?? '').trim() || letter.body.trim()}”`
      : letter.body.trim();

  const blocks = parseParagraphBlocks(measurer, rawBody, bodyFont, metrics.contentWidth);

  if (blocks.length === 0) {
    return [
      {
        pageNumber: 1,
        isFirstPage: true,
        metaLine,
        titleLines,
        bodyLines: [],
      },
    ];
  }

  const pages: PlannedCardPage[] = [];
  let currentBodyLines: CardLineItem[] = [];
  let cursorY = pageOneBodyStartY;
  let isPageOne = true;

  const flushPage = () => {
    pages.push({
      pageNumber: pages.length + 1,
      isFirstPage: isPageOne,
      metaLine: isPageOne ? metaLine : null,
      titleLines: isPageOne ? titleLines : [],
      bodyLines: currentBodyLines,
    });
    currentBodyLines = [];
    isPageOne = false;
    cursorY = metrics.continuationStartY;
  };

  for (const block of blocks) {
    let lineIdx = 0;

    if (currentBodyLines.length > 0) {
      const gap = block.hasBlankGapBefore ? metrics.paragraphGap : metrics.lineBreakGap;
      const nextBaselineY = cursorY + gap;
      const availableLines =
        nextBaselineY <= metrics.maxBaselineY
          ? Math.floor((metrics.maxBaselineY - nextBaselineY) / metrics.bodyLineHeight) + 1
          : 0;

      // Avoid leaving a 1-line orphan at the bottom of a page for multi-line paragraphs
      const wouldOrphan = block.lines.length >= 2 && availableLines === 1;
      if (availableLines <= 0 || wouldOrphan) {
        if (pages.length + 1 < MAX_EXPORT_PAGES) {
          flushPage();
        }
      } else {
        cursorY = nextBaselineY;
      }
    }

    while (lineIdx < block.lines.length) {
      if (cursorY > metrics.maxBaselineY) {
        if (pages.length + 1 < MAX_EXPORT_PAGES) {
          flushPage();
        } else {
          break;
        }
      }

      currentBodyLines.push({
        text: block.lines[lineIdx],
        y: cursorY,
      });
      cursorY += metrics.bodyLineHeight;
      lineIdx += 1;
    }
  }

  if (currentBodyLines.length > 0 || pages.length === 0) {
    flushPage();
  }

  // In single-page Excerpt mode, vertically center the quote gently for visual balance
  if (format === 'excerpt' && pages.length === 1 && pages[0].bodyLines.length > 0) {
    const lines = pages[0].bodyLines;
    const firstY = lines[0].y;
    const lastY = lines[lines.length - 1].y;
    const span = lastY - firstY;
    const availableSpan = metrics.maxBaselineY - metrics.continuationStartY;
    if (span < availableSpan) {
      const desiredFirstY = Math.round(metrics.continuationStartY + (availableSpan - span) / 2);
      const shift = desiredFirstY - firstY;
      if (shift > 0) {
        pages[0].bodyLines = lines.map((item) => ({
          text: item.text,
          y: item.y + shift,
        }));
      }
    }
  }

  return pages;
}

function getCardPalette(template: CardTemplate, variant: CardVariant) {
  if (template === 'monochrome') {
    return variant === 'light'
      ? {
          bg: '#FFFFFF',
          card: '#FFFFFF',
          text: '#1A1A1A',
          muted: '#6B6863',
          border: '#DCD9D2',
          accent: '#1A1A1A',
        }
      : {
          bg: '#161615',
          card: '#161615',
          text: '#F2EFE9',
          muted: '#9D978E',
          border: '#34322E',
          accent: '#F2EFE9',
        };
  }
  if (template === 'stationery') {
    return variant === 'light'
      ? {
          bg: '#F1EFE9',
          card: '#FFFFFF',
          text: '#252525',
          muted: '#77736D',
          border: '#E8E5DF',
          accent: '#80545A',
        }
      : {
          bg: '#1D1B18',
          card: '#24211D',
          text: '#EAE6DF',
          muted: '#A19B92',
          border: '#38332D',
          accent: '#B8838A',
        };
  }
  // editorial
  return variant === 'light'
    ? {
        bg: '#F8F7F3',
        card: '#F8F7F3',
        text: '#252525',
        muted: '#77736D',
        border: '#E8E5DF',
        accent: '#80545A',
      }
    : {
        bg: '#181715',
        card: '#181715',
        text: '#EAE6DF',
        muted: '#A19B92',
        border: '#332F2A',
        accent: '#B8838A',
      };
}

export function createCanvasTextMeasurer(): TextMeasurer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return {
    measureWidth(text: string, font: string): number {
      if (!ctx) return text.length * 16;
      ctx.font = font;
      return ctx.measureText(text).width;
    },
  };
}

async function drawPlannedPageToBlob(
  page: PlannedCardPage,
  totalPages: number,
  options: CardRenderOptions,
  qrImage: HTMLImageElement | null
): Promise<Blob> {
  const metrics = getCardMetrics(options.format);
  const { width, height } = metrics;
  const palette = getCardPalette(options.template, options.variant);

  const canvas = document.createElement('canvas');
  canvas.width = width * CARD_SCALE;
  canvas.height = height * CARD_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for card rendering.');
  }
  ctx.scale(CARD_SCALE, CARD_SCALE);

  // Background & Paper Framing
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  if (options.template === 'stationery') {
    ctx.fillStyle = palette.card;
    ctx.fillRect(54, 54, width - 108, height - 108);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(54, 54, width - 108, height - 108);
  } else {
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, width - 84, height - 84);
  }

  // Header Brand & Category
  ctx.fillStyle = palette.accent;
  ctx.font = CARD_FONTS.brand;
  ctx.fillText('Dear Stranger', metrics.contentX, 122);

  const rightHeaderText = (() => {
    if (options.includeCategory) {
      return page.isFirstPage
        ? options.letter.category.name
        : `${options.letter.category.name} · Continued`;
    }
    return page.isFirstPage ? '' : 'Continued';
  })();

  if (rightHeaderText) {
    ctx.fillStyle = palette.muted;
    ctx.font = CARD_FONTS.category;
    const textW = ctx.measureText(rightHeaderText).width;
    ctx.fillText(rightHeaderText, width - metrics.contentX - textW, 120);
  }

  // Header hairline
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(metrics.contentX, metrics.headerRuleY);
  ctx.lineTo(width - metrics.contentX, metrics.headerRuleY);
  ctx.stroke();

  // Subtle stationery baseline rules aligned behind actual body lines
  if (options.template === 'stationery' && page.bodyLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = palette.border;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    for (const line of page.bodyLines) {
      const ruleY = line.y + 11;
      ctx.beginPath();
      ctx.moveTo(metrics.contentX, ruleY);
      ctx.lineTo(width - metrics.contentX, ruleY);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Page 1 Intro Meta & Title
  if (page.isFirstPage) {
    if (page.metaLine) {
      ctx.fillStyle = palette.muted;
      ctx.font = CARD_FONTS.meta;
      ctx.fillText(page.metaLine, metrics.contentX, metrics.firstPageIntroY);
    }

    if (page.titleLines.length > 0) {
      ctx.fillStyle = palette.text;
      ctx.font = CARD_FONTS.title;
      for (const titleLine of page.titleLines) {
        ctx.fillText(titleLine.text, metrics.contentX, titleLine.y);
      }
    }
  }

  // Body Text
  const bodyFont =
    options.format === 'excerpt' ? CARD_FONTS.bodyExcerpt : CARD_FONTS.bodyFull;
  ctx.fillStyle = palette.text;
  ctx.font = bodyFont;
  for (const line of page.bodyLines) {
    ctx.fillText(line.text, metrics.contentX, line.y);
  }

  // Footer Hairline
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(metrics.contentX, metrics.footerRuleY);
  ctx.lineTo(width - metrics.contentX, metrics.footerRuleY);
  ctx.stroke();

  // Clear Page Numbering (e.g. PAGE 1 OF 4)
  ctx.fillStyle = palette.muted;
  ctx.font = CARD_FONTS.pageNumber;
  const pageLabel = `PAGE ${page.pageNumber} OF ${totalPages}`;
  ctx.fillText(pageLabel, metrics.contentX, metrics.footerRuleY + 48);

  // Brand Tagline
  ctx.fillStyle = palette.muted;
  ctx.font = CARD_FONTS.tagline;
  ctx.fillText(
    'Some things are easier to tell a stranger.',
    metrics.contentX,
    metrics.footerRuleY + 86
  );

  // Optional QR Code
  if (qrImage) {
    ctx.drawImage(qrImage, width - metrics.contentX - 92, metrics.footerRuleY + 18, 92, 92);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error(`Failed to encode card page ${page.pageNumber} as PNG.`));
      },
      'image/png'
    );
  });

  // Free backing store immediately
  canvas.width = 0;
  canvas.height = 0;

  return blob;
}

export async function generateAllCardPages(
  options: CardRenderOptions,
  onProgress?: (completed: number, total: number) => void,
  isCancelled?: () => boolean
): Promise<RenderedPageAsset[]> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const measurer = createCanvasTextMeasurer();
  const plannedPages = planCardPages(measurer, options);
  const totalPages = plannedPages.length;
  const palette = getCardPalette(options.template, options.variant);

  let qrImage: HTMLImageElement | null = null;
  if (options.includeQr) {
    const qrDataUrl = await QRCode.toDataURL(options.shareUrl, {
      width: 112,
      margin: 1,
      color: {
        dark: palette.text,
        light: '#00000000',
      },
    });
    qrImage = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = qrDataUrl;
    });
  }

  const metrics = getCardMetrics(options.format);
  const assets: RenderedPageAsset[] = [];

  try {
    for (let i = 0; i < plannedPages.length; i++) {
      if (isCancelled?.()) {
        revokeCardPageAssets(assets);
        return [];
      }

      const blob = await drawPlannedPageToBlob(plannedPages[i], totalPages, options, qrImage);
      const objectUrl = URL.createObjectURL(blob);
      assets.push({
        pageNumber: plannedPages[i].pageNumber,
        totalPages,
        blob,
        objectUrl,
        width: metrics.width * CARD_SCALE,
        height: metrics.height * CARD_SCALE,
      });

      onProgress?.(i + 1, totalPages);

      // Yield between pages so long letters never freeze the UI
      if (i + 1 < plannedPages.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (isCancelled?.()) {
      revokeCardPageAssets(assets);
      return [];
    }

    return assets;
  } catch (err) {
    revokeCardPageAssets(assets);
    throw err;
  }
}

export function revokeCardPageAssets(assets: RenderedPageAsset[]): void {
  for (const asset of assets) {
    if (asset.objectUrl) {
      URL.revokeObjectURL(asset.objectUrl);
    }
  }
}

export function getPageFilename(pageNumber: number): string {
  return `dear-stranger-letter-page-${pageNumber}.png`;
}

export async function buildCardPagesZip(
  pages: Array<Pick<RenderedPageAsset, 'pageNumber' | 'blob'>>
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const page of pages) {
    zip.file(getPageFilename(page.pageNumber), page.blob);
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function buildCardPagesPdf(
  pages: Array<Pick<RenderedPageAsset, 'pageNumber' | 'blob' | 'width' | 'height'>>
): Promise<Blob> {
  if (pages.length === 0) {
    throw new Error('No pages available to export as PDF.');
  }

  const { jsPDF } = await import('jspdf');
  const first = pages[0];
  // Convert pixel dimensions into PDF points (1px @ 96dpi ≈ 0.75pt)
  const ptWidth = Math.round(first.width * 0.5);
  const ptHeight = Math.round(first.height * 0.5);

  const pdf = new jsPDF({
    orientation: ptHeight >= ptWidth ? 'portrait' : 'landscape',
    unit: 'pt',
    format: [ptWidth, ptHeight],
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageW = Math.round(page.width * 0.5);
    const pageH = Math.round(page.height * 0.5);
    if (i > 0) {
      pdf.addPage([pageW, pageH], pageH >= pageW ? 'portrait' : 'landscape');
    }
    const bytes = new Uint8Array(await page.blob.arrayBuffer());
    pdf.addImage(bytes, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  }

  return pdf.output('blob');
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation slightly so Safari/Firefox complete reading the blob
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}
