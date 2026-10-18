// The typefaces a collection can be set in. Staple runs wherever Chrome does, so each is a stack:
// the Mac face first, then the nearest Windows and Linux faces, then the generic family. E-readers
// may still use the reader's own choice.
export const TYPEFACES = {
  charter: { label: 'Charter', stack: '"Charter", "Bitstream Charter", "Charis SIL", Cambria, Georgia, serif' },
  palatino: { label: 'Palatino', stack: '"Palatino", "Palatino Linotype", "Book Antiqua", "URW Palladio L", "P052", serif' },
  baskerville: { label: 'Baskerville', stack: '"Baskerville", "Baskerville Old Face", "Libre Baskerville", Georgia, serif' },
  iowan: { label: 'Iowan Old Style', stack: '"Iowan Old Style", "Sitka Text", Constantia, Georgia, serif' },
  georgia: { label: 'Georgia', stack: 'Georgia, "DejaVu Serif", serif' },
  sans: { label: 'Sans serif', stack: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif' },
};

export const DEFAULT_TYPEFACE = 'charter';

/** The CSS font stack for `key` (the default for one this version doesn't know). */
export function typefaceStack(key) {
  return (TYPEFACES[key] || TYPEFACES[DEFAULT_TYPEFACE]).stack;
}
