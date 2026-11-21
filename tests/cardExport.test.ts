import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  buildCardPagesPdf,
  buildCardPagesZip,
  CARD_FONTS,
  getCardMetrics,
  getPageFilename,
  planCardPages,
  type TextMeasurer,
} from '../src/lib/letterCardExport.ts';
import type { PublicLetterDTO } from '../src/shared/types.ts';

/**
 * Deterministic proportional measurer approximating 30px Plus Jakarta Sans
 * and 44px Cormorant Garamond widths on 1080px cards.
 */
function createTestMeasurer(): TextMeasurer {
  return {
    measureWidth(text: string, font: string): number {
      const match = /(\d+)px/.exec(font);
      const fontSize = match ? Number(match[1]) : 30;
      const avgCharRatio = font.includes('Cormorant') ? 0.48 : 0.54;
      let width = 0;
      for (const ch of Array.from(text)) {
        if (ch === ' ') {
          width += fontSize * 0.28;
        } else if (ch.codePointAt(0)! > 0x1f00) {
          width += fontSize * 1.05;
        } else {
          width += fontSize * avgCharRatio;
        }
      }
      return width;
    },
  };
}

function makeLetter(overrides: Partial<PublicLetterDTO> = {}): PublicLetterDTO {
  return {
    id: '12345678-abcd-efgh-ijkl-1234567890ab',
    title: 'A quiet note for midnight',
    body: 'Short default letter body.',
    category: { id: 'cat-1', name: 'Quiet Reflections', slug: 'quiet-reflections' },
    authorDisplayName: 'Gentle Wanderer',
    visibility: 'public',
    status: 'published',
    allowExternalSharing: true,
    language: 'en',
    publishedAt: '2026-11-20T10:00:00.000Z',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    replyCount: 0,
    reactions: {
      counts: {
        i_hear_you: 0,
        sending_strength: 0,
        i_understand: 0,
        made_me_smile: 0,
        thank_you: 0,
      },
      total: 0,
      userReaction: null,
    },
    isOwner: false,
    isSaved: false,
    ...overrides,
  };
}

function collectPlacedBodyText(pages: ReturnType<typeof planCardPages>): string {
  return pages
    .flatMap((p) => p.bodyLines.map((l) => l.text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Valid 1x1 transparent PNG (67 bytes) for genuine PNG->PDF/ZIP tests
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makePngBlob(): Blob {
  const buf = Buffer.from(MINIMAL_PNG_BASE64, 'base64');
  return new Blob([buf], { type: 'image/png' });
}

describe('Multi-Page Letter Card Pagination & Export Engine', () => {
  const measurer = createTestMeasurer();
  const metrics = getCardMetrics('full');

  it('1. fits a short letter cleanly on one page with title and intro', () => {
    const body =
      'Sometimes sitting by an open window after rain feels like hitting reset on a heavy week.';
    const pages = planCardPages(measurer, {
      letter: makeLetter({ body }),
      format: 'full',
    });

    assert.equal(pages.length, 1);
    assert.equal(pages[0].pageNumber, 1);
    assert.equal(pages[0].isFirstPage, true);
    assert.ok(pages[0].metaLine?.includes('Gentle Wanderer'));
    assert.ok(pages[0].titleLines.length > 0);
    assert.equal(collectPlacedBodyText(pages), normalizeSourceText(body));
  });

  it('2. paginates a medium-long letter onto 2 pages without repeating title or intro on page 2', () => {
    const para =
      'I have been carrying this small quiet realization all autumn long: most days do not ask us for heroic breakthroughs, only enough patience to keep showing up honestly for the next hour.';
    const body = Array.from({ length: 7 }, (_, i) => `Paragraph ${i + 1}: ${para}`).join('\n\n') +
      '\n\nFINAL SENTENCE ON PAGE TWO.';

    const pages = planCardPages(measurer, {
      letter: makeLetter({ body }),
      format: 'full',
    });

    assert.equal(pages.length, 2);
    assert.equal(pages[0].isFirstPage, true);
    assert.ok(pages[0].titleLines.length > 0);
    assert.ok(pages[0].metaLine !== null);

    assert.equal(pages[1].isFirstPage, false);
    assert.equal(pages[1].pageNumber, 2);
    assert.equal(pages[1].titleLines.length, 0);
    assert.equal(pages[1].metaLine, null);

    const lastLine = pages[1].bodyLines[pages[1].bodyLines.length - 1]?.text;
    assert.ok(lastLine.includes('FINAL SENTENCE ON PAGE TWO.'));
    assert.equal(collectPlacedBodyText(pages), normalizeSourceText(body));
  });

  it('3. paginates a very long letter across 4+ pages preserving complete text and vertical bounds', () => {
    const segment =
      'Walking home beneath amber streetlights made me think about how many conversations stay unspoken simply because neither person wants to disturb the calm.';
    const body =
      Array.from({ length: 24 }, (_, i) => `Entry ${i + 1}: ${segment}`).join('\n\n') +
      '\n\nActual letter closing words here.';

    const pages = planCardPages(measurer, {
      letter: makeLetter({ body }),
      format: 'full',
    });

    assert.ok(pages.length >= 4, `Expected >= 4 pages, got ${pages.length}`);
    for (let i = 0; i < pages.length; i++) {
      assert.equal(pages[i].pageNumber, i + 1);
      for (const line of pages[i].bodyLines) {
        assert.ok(line.y <= metrics.maxBaselineY, `Line exceeded maxBaselineY on page ${i + 1}`);
        assert.ok(
          measurer.measureWidth(line.text, CARD_FONTS.bodyFull) <= metrics.contentWidth + 0.01,
          `Line overflowed contentWidth: ${line.text}`
        );
      }
    }

    const reconstructed = collectPlacedBodyText(pages);
    assert.equal(reconstructed, normalizeSourceText(body));
    assert.ok(
      pages[pages.length - 1].bodyLines.some((l) => l.text.includes('Actual letter closing words here.'))
    );
  });

  it('4. handles ~9,000-character multi-paragraph confessions without truncation', () => {
    const sentence =
      'Every time someone tells a stranger the truth without armor, the room inside this little archive gets a fraction warmer and less lonely.';
    const body =
      Array.from({ length: 65 }, (_, i) => `[${i + 1}] ${sentence}`).join('\n\n') +
      ' END-OF-CONFESSION.';

    assert.ok(body.length > 8500);
    const pages = planCardPages(measurer, {
      letter: makeLetter({ body, title: null }),
      format: 'full',
    });

    assert.ok(pages.length >= 6);
    assert.equal(collectPlacedBodyText(pages), normalizeSourceText(body));
    assert.ok(
      pages[pages.length - 1].bodyLines.some((l) => l.text.includes('END-OF-CONFESSION.'))
    );
  });

  it('5. preserves emojis, surrogate pairs, special characters, and punctuation', () => {
    const body =
      'Thank you 🫂🤍🥹🙏❤️‍🩹 for listening without judgement — café mornings, “quoted thoughts”, naïve honesty & sharp dashes… never forgotten ✨!';
    const pages = planCardPages(measurer, {
      letter: makeLetter({ body }),
      format: 'full',
    });

    assert.equal(collectPlacedBodyText(pages), normalizeSourceText(body));
  });

  it('6. handles unusually long single paragraphs and unbroken strings without word-splitting normal words or overflowing edges', () => {
    const longNormalPara = Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ');
    const giantToken = 'supercalifragilisticexpialidocious'.repeat(4);
    const body = `${longNormalPara} ${giantToken} tailword.`;

    const pages = planCardPages(measurer, {
      letter: makeLetter({ body }),
      format: 'full',
    });

    assert.ok(pages.length >= 2);
    for (const page of pages) {
      for (const line of page.bodyLines) {
        assert.ok(
          measurer.measureWidth(line.text, CARD_FONTS.bodyFull) <= metrics.contentWidth + 0.01,
          `Line overflowed card margin: ${line.text}`
        );
      }
    }
    // Reconstructed without spaces around wrapped token equals exact text tokens joined
    const reconstructedNoSpace = collectPlacedBodyText(pages).replace(/\s+/g, '');
    const originalNoSpace = body.replace(/\s+/g, '');
    assert.equal(reconstructedNoSpace, originalNoSpace);

    // Confirm normal words like word199 stayed intact on a single line
    const allLines = pages.flatMap((p) => p.bodyLines.map((l) => l.text));
    assert.ok(allLines.some((l) => l.includes('word199')));
    assert.ok(allLines[allLines.length - 1].includes('tailword.'));
  });

  it('7. exports every generated page into a valid ZIP archive and complete multi-page PDF', async () => {
    const mockPages = [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      blob: makePngBlob(),
      width: 2160,
      height: 2700,
    }));

    const zipBlob = await buildCardPagesZip(mockPages);
    const zipBuffer = Buffer.from(await zipBlob.arrayBuffer());
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    const filenames = Object.keys(loadedZip.files).sort();

    assert.deepEqual(filenames, [
      getPageFilename(1),
      getPageFilename(2),
      getPageFilename(3),
      getPageFilename(4),
    ]);

    const pdfBlob = await buildCardPagesPdf(mockPages);
    const pdfText = Buffer.from(await pdfBlob.arrayBuffer()).toString('latin1');
    assert.ok(pdfText.startsWith('%PDF-'));
    // Verify 4 PDF Page objects (/Type /Page)
    const pageObjectMatches = pdfText.match(/\/Type\s*\/Page\b/g) || [];
    assert.equal(pageObjectMatches.length, 4);
  });
});
