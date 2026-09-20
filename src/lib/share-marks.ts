/*
  Share marks inherit currentColor so each icon follows its label's rest and hover colors.
  Keeping just the paths here lets the same marks be checked without a browser.
*/

import type { SharePlatform } from './share-links';

/**
 * How a mark is drawn.
 *
 * `solid` fills the path with currentColor. `stroked` draws it with currentColor and no
 * fill at all, which is what the copy link icon uses.
 */
export type MarkKind = 'solid' | 'stroked';

export interface ShareMark {
  readonly kind: MarkKind;
  readonly paths: readonly string[];
}

/*
  Copy link is deliberately not a logo.

  It sits below the rule that already tells a reader that row is a different kind of thing,
  so it speaks a different language on purpose: a UI icon stroked at 2 units rather than a
  solid brand mark. Same optical weight, different vocabulary. A fifth logo shaped thing
  would say copy link is a fifth destination, and it is not a destination at all.
*/
export const SHARE_MARKS: Record<SharePlatform, ShareMark> = {
  x: {
    kind: 'solid',
    paths: [
      'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68' +
        'l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117' +
        'L17.083 19.77Z'
    ]
  },

  bluesky: {
    kind: 'solid',
    paths: [
      'M12 10.8C10.913 8.686 7.954 4.747 5.202 2.805 2.566.944 1.561 1.266.902 1.565' +
        '.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383' +
        ' 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005' +
        '-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308' +
        ' 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036' +
        '.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139' +
        '-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z'
    ]
  },

  linkedin: {
    kind: 'solid',
    paths: [
      'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445' +
        '-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0' +
        ' 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064' +
        ' 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792' +
        ' 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24' +
        ' 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z'
    ]
  },

  facebook: {
    kind: 'solid',
    paths: [
      'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125' +
        ' 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0' +
        ' 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532' +
        ' 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z'
    ]
  },

  copy: {
    kind: 'stroked',
    paths: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
    ]
  }
};

/*
  The box every mark is drawn on. All five share it, so five shapes of different
  proportions keep one left edge and five labels start on the same line.
*/
export const MARK_VIEWBOX = '0 0 24 24';
