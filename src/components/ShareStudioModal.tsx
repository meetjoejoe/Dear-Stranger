import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';

type CardFormat = 'full' | 'excerpt';
type CardTemplate = 'editorial' | 'monochrome' | 'stationery';
type CardVariant = 'light' | 'dark';

interface ShareStudioModalProps {
  open: boolean;
  onClose: () => void;
  letter: PublicLetterDTO;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === '') {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length >= maxLines) break;
  }

  if (lines.length >= maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? `${last.slice(0, -1)}…` : `${last}…`;
  }
  return lines.slice(0, maxLines);
}

export function ShareStudioModal({ open, onClose, letter }: ShareStudioModalProps) {
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [format, setFormat] = useState<CardFormat>('excerpt');
  const [template, setTemplate] = useState<CardTemplate>('editorial');
  const [variant, setVariant] = useState<CardVariant>('light');
  const [includeCategory, setIncludeCategory] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [excerptText, setExcerptText] = useState(() => {
    const firstChunk = letter.body.slice(0, 280).trim();
    return letter.body.length > 280 ? `${firstChunk}…` : firstChunk;
  });
  const [copied, setCopied] = useState(false);
  const [showInstagramGuide, setShowInstagramGuide] = useState(false);
  const [rendering, setRendering] = useState(false);

  const shareUrl = `${window.location.origin}/letters/${letter.id}`;

  useEffect(() => {
    const firstChunk = letter.body.slice(0, 280).trim();
    setExcerptText(letter.body.length > 280 ? `${firstChunk}…` : firstChunk);
  }, [letter.id, letter.body]);

  const drawCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const scale = 2;
      const width = 1080;
      const height = format === 'excerpt' ? 1080 : 1350;
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);

      // Controlled Brand Palettes Only
      const palette = (() => {
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
      })();

      // Background
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, width, height);

      // Stationery sheet inset
      const pad = 76;
      if (template === 'stationery') {
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

      // Header Wordmark
      const contentX = pad + 24;
      const contentWidth = width - contentX * 2;

      ctx.fillStyle = palette.accent;
      ctx.font = '600 32px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('Dear Stranger', contentX, 128);

      if (includeCategory) {
        ctx.fillStyle = palette.muted;
        ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
        const catText = letter.category.name;
        const catWidth = ctx.measureText(catText).width;
        ctx.fillText(catText, width - contentX - catWidth, 126);
      }

      // Subtle hairline divider
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(contentX, 158);
      ctx.lineTo(width - contentX, 158);
      ctx.stroke();

      // Subtle stationery ruled lines
      if (template === 'stationery') {
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        for (let y = 260; y < height - 230; y += 54) {
          ctx.beginPath();
          ctx.moveTo(contentX, y);
          ctx.lineTo(width - contentX, y);
          ctx.stroke();
        }
      }

      // Title (Full Letter format)
      let cursorY = 232;
      if (format === 'full' && letter.title) {
        ctx.fillStyle = palette.text;
        ctx.font = '600 48px "Cormorant Garamond", Georgia, serif';
        const titleLines = wrapTextLines(ctx, letter.title, contentWidth, 3);
        for (const line of titleLines) {
          ctx.fillText(line, contentX, cursorY);
          cursorY += 56;
        }
        cursorY += 20;
      }

      // Main Body or Excerpt
      const textToDraw =
        format === 'excerpt' ? excerptText.trim() || letter.body.slice(0, 260) : letter.body;

      ctx.fillStyle = palette.text;
      if (format === 'excerpt') {
        ctx.font = 'italic 400 44px "Cormorant Garamond", Georgia, serif';
        const quoteLines = wrapTextLines(ctx, `“${textToDraw}”`, contentWidth, 11);
        const totalTextHeight = quoteLines.length * 60;
        const availableCenter = height - 220 - 180;
        cursorY = Math.max(240, 190 + (availableCenter - totalTextHeight) / 2);
        for (const line of quoteLines) {
          ctx.fillText(line, contentX, cursorY);
          cursorY += 60;
        }
      } else {
        ctx.font = '400 30px "Plus Jakarta Sans", sans-serif';
        const bodyLines = wrapTextLines(ctx, textToDraw, contentWidth, 20);
        for (const line of bodyLines) {
          if (line === '') {
            cursorY += 24;
          } else {
            ctx.fillText(line, contentX, cursorY);
            cursorY += 46;
          }
        }
      }

      // Footer
      const footerY = height - 150;
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(contentX, footerY - 26);
      ctx.lineTo(width - contentX, footerY - 26);
      ctx.stroke();

      ctx.fillStyle = palette.muted;
      ctx.font = 'italic 400 26px "Cormorant Garamond", Georgia, serif';
      ctx.fillText('Some things are easier to tell a stranger.', contentX, footerY + 34);

      if (includeQr) {
        const qrDataUrl = await QRCode.toDataURL(shareUrl, {
          width: 112,
          margin: 1,
          color: {
            dark: palette.text,
            light: '#00000000',
          },
        });
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = qrDataUrl;
        });
        ctx.drawImage(img, width - contentX - 96, footerY - 12, 96, 96);
      }
    } finally {
      setRendering(false);
    }
  }, [excerptText, format, includeCategory, includeQr, letter.body, letter.category.name, letter.title, shareUrl, template, variant]);

  useEffect(() => {
    if (open) {
      void drawCard();
    }
  }, [open, drawCard]);

  if (!open) return null;

  const trackShare = () => {
    void apiFetch(`/api/letters/${letter.id}/share-event`, { method: 'POST' }).catch(() => {});
  };

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `dear-stranger-${letter.id.slice(0, 8)}-${format}.png`;
    a.click();
    trackShare();
    showToast('Share card image downloaded.', 'success');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackShare();
      showToast('Letter link copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy link automatically.', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      await handleCopyLink();
      return;
    }
    try {
      const canvas = canvasRef.current;
      let files: File[] | undefined;
      if (canvas && navigator.canShare) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/png')
        );
        if (blob) {
          const file = new File([blob], `dear-stranger-${letter.id.slice(0, 8)}.png`, {
            type: 'image/png',
          });
          if (navigator.canShare({ files: [file] })) {
            files = [file];
          }
        }
      }
      await navigator.share({
        title: letter.title || 'An anonymous letter on Dear Stranger',
        text: 'Some things are easier to tell a stranger.',
        url: shareUrl,
        ...(files ? { files } : {}),
      });
      trackShare();
    } catch {
      // User dismissed share sheet
    }
  };

  const shareText = encodeURIComponent(
    `${letter.title ? `${letter.title} — ` : ''}Read this anonymous letter on Dear Stranger`
  );
  const encodedUrl = encodeURIComponent(shareUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-studio-title"
    >
      <div className="w-full max-w-5xl rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-5 sm:p-8 shadow-sm my-auto max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8E5DF] dark:border-[#332F2A]">
          <div>
            <h2 id="share-studio-title" className="font-editorial text-2xl sm:text-3xl font-semibold">
              Share Studio
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-0.5">
              Create a clean card to share this letter without revealing any personal details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Share Studio"
            className="p-1.5 text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls */}
          <div className="lg:col-span-5 space-y-5">
            <div>
              <span className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2">
                Card Format
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-md bg-[#F1EFE9] dark:bg-[#282521]">
                <button
                  type="button"
                  onClick={() => setFormat('excerpt')}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    format === 'excerpt'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Excerpt Card
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('full')}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    format === 'full'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Full Letter Card
                </button>
              </div>
            </div>

            {format === 'excerpt' && (
              <div>
                <label htmlFor="share-excerpt" className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2">
                  Select Excerpt
                </label>
                <textarea
                  id="share-excerpt"
                  rows={4}
                  maxLength={320}
                  value={excerptText}
                  onChange={(e) => setExcerptText(e.target.value)}
                  className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm leading-relaxed"
                />
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-1 tabular-nums">
                  {excerptText.length}/320 characters
                </p>
              </div>
            )}

            <div>
              <span className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2">
                Template
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['editorial', 'Editorial paper'],
                    ['monochrome', 'Minimal mono'],
                    ['stationery', 'Stationery'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTemplate(id)}
                    className={`py-2 px-2.5 text-xs font-medium rounded border transition-colors ${
                      template === id
                        ? 'border-[#80545A] dark:border-[#B8838A] bg-[#F1EFE9] dark:bg-[#282521] text-[#252525] dark:text-[#EAE6DF]'
                        : 'border-[#E8E5DF] dark:border-[#332F2A] text-[#77736D] dark:text-[#A19B92]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2">
                Appearance
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-md bg-[#F1EFE9] dark:bg-[#282521]">
                <button
                  type="button"
                  onClick={() => setVariant('light')}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    variant === 'light'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Light Card
                </button>
                <button
                  type="button"
                  onClick={() => setVariant('dark')}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    variant === 'dark'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Dark Card
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-sm">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCategory}
                  onChange={(e) => setIncludeCategory(e.target.checked)}
                  className="accent-[#80545A]"
                />
                <span>Include category label</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeQr}
                  onChange={(e) => setIncludeQr(e.target.checked)}
                  className="accent-[#80545A]"
                />
                <span>Include QR code to original letter</span>
              </label>
            </div>

            {/* Primary Export Actions */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={rendering}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#80545A] hover:bg-[#6C454A] text-white px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download PNG Image
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share Sheet
                </button>
              </div>
            </div>

            {/* Social Sharing Links */}
            <div className="pt-3 border-t border-[#E8E5DF] dark:border-[#332F2A]">
              <p className="text-xs text-[#77736D] dark:text-[#A19B92] mb-2.5">
                Share directly to:
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <a
                  href={`https://wa.me/?text=${shareText}%20${encodedUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackShare}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackShare}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  Facebook
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackShare}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  X
                </a>
                <button
                  type="button"
                  onClick={() => setShowInstagramGuide((v) => !v)}
                  className="rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-1.5 hover:bg-[#F1EFE9] dark:hover:bg-[#282521]"
                >
                  Instagram Stories
                </button>
              </div>

              {showInstagramGuide && (
                <div className="mt-3 rounded-md bg-[#F8F7F3] dark:bg-[#181715] border border-[#E8E5DF] dark:border-[#332F2A] p-3.5 text-xs text-[#77736D] dark:text-[#A19B92] space-y-1.5 leading-relaxed">
                  <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                    How to share to Instagram Stories:
                  </p>
                  <p>1. Tap &ldquo;Download PNG Image&rdquo; above to save the card to your device.</p>
                  <p>2. Open Instagram, create a Story, and select the saved card image.</p>
                  <p>3. Optional: tap &ldquo;Copy Link&rdquo; and add a Link sticker so readers can reply.</p>
                </div>
              )}
            </div>
          </div>

          {/* Live Card Preview */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] p-4 sm:p-6">
            <canvas
              ref={canvasRef}
              aria-label="Share card preview"
              className="w-full max-w-[440px] h-auto rounded shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
