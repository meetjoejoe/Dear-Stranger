import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Copy,
  Download,
  FileText,
  FolderArchive,
  LayoutGrid,
  Loader2,
  Share2,
  Square,
  X,
} from 'lucide-react';
import type { PublicLetterDTO } from '../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import {
  buildCardPagesPdf,
  buildCardPagesZip,
  generateAllCardPages,
  getPageFilename,
  revokeCardPageAssets,
  triggerBlobDownload,
  type CardFormat,
  type CardTemplate,
  type CardVariant,
  type RenderedPageAsset,
} from '../lib/letterCardExport.ts';

interface ShareStudioModalProps {
  open: boolean;
  onClose: () => void;
  letter: PublicLetterDTO;
}

export function ShareStudioModal({ open, onClose, letter }: ShareStudioModalProps) {
  const { showToast } = useToast();

  const [format, setFormat] = useState<CardFormat>('full');
  const [template, setTemplate] = useState<CardTemplate>('editorial');
  const [variant, setVariant] = useState<CardVariant>('light');
  const [includeCategory, setIncludeCategory] = useState(true);
  const [includeQr, setIncludeQr] = useState(true);
  const [excerptText, setExcerptText] = useState(() => {
    const firstChunk = letter.body.slice(0, 280).trim();
    return letter.body.length > 280 ? `${firstChunk}…` : firstChunk;
  });

  const [pages, setPages] = useState<RenderedPageAsset[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState<'single' | 'all'>('single');
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sharingAll, setSharingAll] = useState(false);

  const [copied, setCopied] = useState(false);
  const [showInstagramGuide, setShowInstagramGuide] = useState(false);

  const latestPagesRef = useRef<RenderedPageAsset[]>([]);
  const shareUrl = `${window.location.origin}/letters/${letter.id}`;
  const shortId = letter.id.slice(0, 8);

  useEffect(() => {
    const firstChunk = letter.body.slice(0, 280).trim();
    setExcerptText(letter.body.length > 280 ? `${firstChunk}…` : firstChunk);
    setCurrentPageIndex(0);
    setPreviewMode('single');
  }, [letter.id, letter.body]);

  useEffect(() => {
    if (!open) {
      revokeCardPageAssets(latestPagesRef.current);
      latestPagesRef.current = [];
      setPages([]);
      return;
    }

    let cancelled = false;
    setRendering(true);
    setRenderProgress(null);

    void generateAllCardPages(
      {
        letter,
        format,
        template,
        variant,
        includeCategory,
        includeQr,
        excerptText,
        shareUrl,
      },
      (done, total) => {
        if (!cancelled) {
          setRenderProgress({ done, total });
        }
      },
      () => cancelled
    )
      .then((generated) => {
        if (cancelled) {
          revokeCardPageAssets(generated);
          return;
        }
        const prev = latestPagesRef.current;
        latestPagesRef.current = generated;
        setPages(generated);
        setCurrentPageIndex((idx) =>
          generated.length === 0 ? 0 : Math.min(idx, generated.length - 1)
        );
        revokeCardPageAssets(prev);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(
            err instanceof Error ? err.message : 'Could not render letter pages.',
            'error'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRendering(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    letter,
    format,
    template,
    variant,
    includeCategory,
    includeQr,
    excerptText,
    shareUrl,
    showToast,
  ]);

  useEffect(() => {
    return () => {
      revokeCardPageAssets(latestPagesRef.current);
      latestPagesRef.current = [];
    };
  }, []);

  if (!open) return null;

  const totalPages = pages.length;
  const safeIndex = totalPages > 0 ? Math.min(currentPageIndex, totalPages - 1) : 0;
  const currentAsset = pages[safeIndex] ?? null;
  const isBusy = rendering || exportingZip || exportingPdf || sharingAll || pages.length === 0;

  const trackShare = () => {
    void apiFetch(`/api/letters/${letter.id}/share-event`, { method: 'POST' }).catch(() => {});
  };

  const handleDownloadCurrentPage = () => {
    if (!currentAsset) return;
    triggerBlobDownload(currentAsset.blob, getPageFilename(currentAsset.pageNumber));
    trackShare();
    showToast(
      `Downloaded page ${currentAsset.pageNumber} of ${totalPages}.`,
      'success'
    );
  };

  const handleDownloadAllZip = async () => {
    if (pages.length === 0 || exportingZip) return;
    setExportingZip(true);
    try {
      const zipBlob = await buildCardPagesZip(pages);
      triggerBlobDownload(zipBlob, `dear-stranger-letter-${shortId}-all-pages.zip`);
      trackShare();
      showToast(
        `Downloaded ZIP archive with ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not create ZIP archive.',
        'error'
      );
    } finally {
      setExportingZip(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (pages.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const pdfBlob = await buildCardPagesPdf(pages);
      triggerBlobDownload(pdfBlob, `dear-stranger-letter-${shortId}.pdf`);
      trackShare();
      showToast(
        `Exported ${pages.length}-page PDF letter.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not generate PDF export.',
        'error'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleShareAllPages = async () => {
    if (pages.length === 0 || sharingAll) return;
    setSharingAll(true);
    try {
      const files = pages.map(
        (page) =>
          new File([page.blob], getPageFilename(page.pageNumber), {
            type: 'image/png',
          })
      );

      const canShareAllFiles =
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files });

      if (canShareAllFiles) {
        await navigator.share({
          title: letter.title || 'An anonymous letter on Dear Stranger',
          text:
            pages.length > 1
              ? `Read this ${pages.length}-page anonymous letter on Dear Stranger.`
              : 'Some things are easier to tell a stranger.',
          url: shareUrl,
          files,
        });
        trackShare();
        return;
      }

      // Clear fallback when multi-file sharing is unsupported by browser/device
      if (pages.length === 1) {
        triggerBlobDownload(pages[0].blob, getPageFilename(1));
        trackShare();
        showToast(
          'Direct file sharing is unavailable here — downloaded letter image instead.',
          'info'
        );
      } else {
        const zipBlob = await buildCardPagesZip(pages);
        triggerBlobDownload(zipBlob, `dear-stranger-letter-${shortId}-all-pages.zip`);
        trackShare();
        showToast(
          'Multi-image sharing is not supported on this browser — downloaded all pages as ZIP instead.',
          'info'
        );
      }
    } catch (err) {
      // Ignore user cancellation in native share sheet
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Fallback to Download All Pages if share failed unexpectedly
      if (pages.length > 1) {
        const zipBlob = await buildCardPagesZip(pages);
        triggerBlobDownload(zipBlob, `dear-stranger-letter-${shortId}-all-pages.zip`);
        showToast('Downloaded all pages as ZIP archive.', 'info');
      }
    } finally {
      setSharingAll(false);
    }
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

  const shareText = encodeURIComponent(
    `${letter.title ? `${letter.title} — ` : ''}Read this anonymous letter on Dear Stranger`
  );
  const encodedUrl = encodeURIComponent(shareUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2.5 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-studio-title"
    >
      <div className="w-full max-w-5xl rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] p-4 sm:p-7 shadow-sm my-auto max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8E5DF] dark:border-[#332F2A]">
          <div>
            <h2 id="share-studio-title" className="font-editorial text-2xl sm:text-3xl font-semibold">
              Share Studio
            </h2>
            <p className="text-sm text-[#77736D] dark:text-[#A19B92] mt-0.5">
              Save or share the complete letter across clean, automatically paginated cards.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Share Studio"
            className="p-2 text-[#77736D] hover:text-[#252525] dark:text-[#A19B92] dark:hover:text-[#EAE6DF] rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Controls & Exports */}
          <div className="lg:col-span-5 space-y-5 order-2 lg:order-1">
            <div>
              <span className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2">
                Card Format
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-md bg-[#F1EFE9] dark:bg-[#282521]">
                <button
                  type="button"
                  onClick={() => {
                    setFormat('full');
                    setCurrentPageIndex(0);
                  }}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    format === 'full'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Full Letter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormat('excerpt');
                    setCurrentPageIndex(0);
                  }}
                  className={`py-2 px-3 text-xs sm:text-sm font-medium rounded transition-colors ${
                    format === 'excerpt'
                      ? 'bg-[#FFFFFF] dark:bg-[#201E1B] text-[#252525] dark:text-[#EAE6DF]'
                      : 'text-[#77736D] dark:text-[#A19B92]'
                  }`}
                >
                  Excerpt Card
                </button>
              </div>
            </div>

            {format === 'excerpt' && (
              <div>
                <label
                  htmlFor="share-excerpt"
                  className="block text-xs font-medium uppercase tracking-wider text-[#77736D] dark:text-[#A19B92] mb-2"
                >
                  Select Excerpt
                </label>
                <textarea
                  id="share-excerpt"
                  rows={4}
                  value={excerptText}
                  onChange={(e) => {
                    setExcerptText(e.target.value);
                    setCurrentPageIndex(0);
                  }}
                  className="w-full rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] px-3 py-2 text-sm leading-relaxed"
                />
                <p className="text-xs text-[#77736D] dark:text-[#A19B92] mt-1 tabular-nums">
                  {excerptText.length} characters · Auto-paginates if longer than one card
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

            <div className="space-y-2 pt-0.5 text-sm">
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
            <div className="pt-2 space-y-2.5 border-t border-[#E8E5DF] dark:border-[#332F2A]">
              <button
                type="button"
                onClick={handleDownloadCurrentPage}
                disabled={isBusy}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md bg-[#80545A] hover:bg-[#6C454A] disabled:opacity-60 text-white px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {totalPages > 1
                    ? `Download Page ${safeIndex + 1} (PNG)`
                    : 'Download PNG Image'}
                </span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadAllZip()}
                  disabled={isBusy}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521] disabled:opacity-60 transition-colors"
                >
                  {exportingZip ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <FolderArchive className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {exportingZip
                      ? 'Building ZIP…'
                      : `Download All (${totalPages || '…'} ZIP)`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={isBusy}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521] disabled:opacity-60 transition-colors"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 shrink-0" />
                  )}
                  <span>{exportingPdf ? 'Building PDF…' : 'Export Complete PDF'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleShareAllPages()}
                  disabled={isBusy}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] px-3 py-2 text-xs sm:text-sm hover:bg-[#F1EFE9] dark:hover:bg-[#282521] disabled:opacity-60 transition-colors"
                >
                  {sharingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  <span>{totalPages > 1 ? 'Share All Pages' : 'Share Card'}</span>
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
                  Instagram Carousel / Stories
                </button>
              </div>

              {showInstagramGuide && (
                <div className="mt-3 rounded-md bg-[#F8F7F3] dark:bg-[#181715] border border-[#E8E5DF] dark:border-[#332F2A] p-3.5 text-xs text-[#77736D] dark:text-[#A19B92] space-y-1.5 leading-relaxed">
                  <p className="font-medium text-[#252525] dark:text-[#EAE6DF]">
                    How to share a multi-page letter on Instagram:
                  </p>
                  <p>
                    1. Tap &ldquo;Download All ({totalPages} ZIP)&rdquo; and extract the numbered
                    PNG images in order.
                  </p>
                  <p>2. Create an Instagram Post or Story and select the pages from 1 to {totalPages}.</p>
                  <p>3. Optional: tap &ldquo;Copy Link&rdquo; and add a Link sticker so readers can reply.</p>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Page Preview */}
          <div className="lg:col-span-7 flex flex-col rounded-lg border border-[#E8E5DF] dark:border-[#332F2A] bg-[#F8F7F3] dark:bg-[#181715] p-3.5 sm:p-5 order-1 lg:order-2">
            {/* Preview Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#E8E5DF] dark:border-[#332F2A]">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                {rendering ? (
                  <span className="inline-flex items-center gap-1.5 text-[#77736D] dark:text-[#A19B92]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {renderProgress
                      ? `Rendering page ${renderProgress.done} of ${renderProgress.total}…`
                      : 'Measuring and rendering pages…'}
                  </span>
                ) : (
                  <>
                    <span className="text-[#252525] dark:text-[#EAE6DF] tabular-nums">
                      Page {safeIndex + 1} of {totalPages}
                    </span>
                    <span className="text-[#77736D] dark:text-[#A19B92]">·</span>
                    <span className="text-xs text-[#77736D] dark:text-[#A19B92] tabular-nums">
                      {totalPages} {totalPages === 1 ? 'total image' : 'total images'}
                    </span>
                  </>
                )}
              </div>

              {totalPages > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setPreviewMode((mode) => (mode === 'single' ? 'all' : 'single'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors min-h-[34px]"
                >
                  {previewMode === 'single' ? (
                    <>
                      <LayoutGrid className="w-3.5 h-3.5" />
                      View All Pages ({totalPages})
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      Single Page View
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Rendered Actual PNG Output */}
            {previewMode === 'single' || totalPages <= 1 ? (
              <div className="flex flex-col items-center">
                <div className="w-full max-w-[430px] flex items-center justify-center min-h-[300px]">
                  {currentAsset ? (
                    <img
                      src={currentAsset.objectUrl}
                      alt={`Dear Stranger letter card page ${currentAsset.pageNumber} of ${totalPages}`}
                      className="w-full h-auto rounded shadow-sm border border-[#E8E5DF]/60 dark:border-[#332F2A]/60"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-16 text-xs text-[#77736D] dark:text-[#A19B92]">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Preparing card preview…</span>
                    </div>
                  )}
                </div>

                {/* Pagination Bar */}
                {totalPages > 1 && (
                  <div className="mt-4 w-full flex flex-col items-center gap-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPageIndex(0)}
                        disabled={safeIndex === 0}
                        aria-label="Return to first page"
                        title="First page"
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">First</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
                        disabled={safeIndex === 0}
                        aria-label="Previous page"
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>

                      <span className="px-2.5 text-xs font-medium text-[#77736D] dark:text-[#A19B92] tabular-nums">
                        {safeIndex + 1} / {totalPages}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setCurrentPageIndex((i) => Math.min(totalPages - 1, i + 1))
                        }
                        disabled={safeIndex >= totalPages - 1}
                        aria-label="Next page"
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-md border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-[#F1EFE9] dark:hover:bg-[#282521] transition-colors"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Page Jump Thumbnails / Dots */}
                    <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-full">
                      {pages.map((p, idx) => (
                        <button
                          key={p.pageNumber}
                          type="button"
                          onClick={() => setCurrentPageIndex(idx)}
                          aria-label={`Jump to page ${p.pageNumber}`}
                          aria-current={idx === safeIndex ? 'page' : undefined}
                          className={`min-w-[32px] h-8 px-2 rounded text-xs font-medium tabular-nums transition-colors ${
                            idx === safeIndex
                              ? 'bg-[#80545A] dark:bg-[#B8838A] text-white dark:text-[#181715]'
                              : 'border border-[#E8E5DF] dark:border-[#332F2A] bg-[#FFFFFF] dark:bg-[#201E1B] text-[#77736D] dark:text-[#A19B92] hover:bg-[#F1EFE9] dark:hover:bg-[#282521]'
                          }`}
                        >
                          {p.pageNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Complete Set Gallery View */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#77736D] dark:text-[#A19B92]">
                  <span>All {totalPages} generated cards (click any page to inspect)</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPageIndex(0);
                      setPreviewMode('single');
                    }}
                    className="text-[#80545A] dark:text-[#B8838A] hover:underline font-medium"
                  >
                    Return to Page 1
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {pages.map((p, idx) => (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => {
                        setCurrentPageIndex(idx);
                        setPreviewMode('single');
                      }}
                      className={`group text-left rounded-md border p-1.5 transition-colors bg-[#FFFFFF] dark:bg-[#201E1B] ${
                        idx === safeIndex
                          ? 'border-[#80545A] dark:border-[#B8838A]'
                          : 'border-[#E8E5DF] dark:border-[#332F2A] hover:border-[#80545A]/60 dark:hover:border-[#B8838A]/60'
                      }`}
                    >
                      <img
                        src={p.objectUrl}
                        alt={`Page ${p.pageNumber} of ${totalPages}`}
                        className="w-full h-auto rounded-sm"
                      />
                      <span className="mt-1.5 block text-center text-[11px] font-medium text-[#77736D] dark:text-[#A19B92] tabular-nums">
                        Page {p.pageNumber} of {totalPages}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
