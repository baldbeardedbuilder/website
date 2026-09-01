const CLOUDINARY_BASE = 'https://res.cloudinary.com/dk3rdh3yo/image/upload';
const BACKGROUND_COUNT = 6;
const MAX_SUBHEAD_LENGTH = 20;
const PROTECTED_PRODUCT_NAMES = [
  ['entity', 'framework', 'core'],
  ['visual', 'studio', 'code'],
  ['asp.net', 'core'],
  ['ef', 'core'],
  ['entity', 'framework'],
  ['sql', 'server'],
  ['visual', 'studio'],
  ['github', 'actions'],
  ['github', 'copilot'],
  ['azure', 'functions'],
  ['.net', 'aspire'],
  ['.net', 'maui']
] as const;
const PRODUCT_VERSION = /^v?\d+(?:\.\d+)*(?:-(?:preview|rc)\.?\d*)?$/i;

export interface ContentSocialImage {
  key: string;
  title: string;
  topics: string[];
}

function encodeText(value: string): string {
  return encodeURIComponent(value.toLocaleUpperCase('en-US')).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function productToken(word: string): string {
  return word
    .replace(/^[([{"'`]+/, '')
    .replace(/[)\]}"'`,:;!?.]+$/, '')
    .toLocaleLowerCase('en-US');
}

function protectedTitleBoundaries(words: string[]): Set<number> {
  const tokens = words.map(productToken);
  const protectedBoundaries = new Set<number>();

  for (let start = 0; start < tokens.length; start += 1) {
    const product = PROTECTED_PRODUCT_NAMES.find((name) =>
      name.every((token, offset) => tokens[start + offset] === token)
    );
    if (!product) continue;

    let end = start + product.length;
    if (end < tokens.length && PRODUCT_VERSION.test(tokens[end])) end += 1;

    for (let boundary = start + 1; boundary < end; boundary += 1) {
      protectedBoundaries.add(boundary);
    }
    start = end - 1;
  }

  return protectedBoundaries;
}

export function splitSocialTitle(title: string): { main: string; ending: string } {
  const normalized = title.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('A social image title cannot be empty.');

  const words = normalized.split(' ');
  const endingLength = Math.min(5, Math.max(1, Math.ceil(words.length * 0.4)));
  const idealBoundary = words.length - endingLength;
  const protectedBoundaries = protectedTitleBoundaries(words);
  const safeBoundaries = Array.from(
    { length: Math.max(0, words.length - 1) },
    (_, index) => index + 1
  ).filter(
    (boundary) =>
      !protectedBoundaries.has(boundary) &&
      words.slice(boundary).join(' ').length <= MAX_SUBHEAD_LENGTH
  );
  const boundary = safeBoundaries.reduce(
    (closest, candidate) => {
      const candidateDistance = Math.abs(candidate - idealBoundary);
      const closestDistance = Math.abs(closest - idealBoundary);
      return candidateDistance < closestDistance ||
        (candidateDistance === closestDistance && candidate < closest)
        ? candidate
        : closest;
    },
    safeBoundaries[0] ?? 0
  );

  if (!boundary) return { main: normalized, ending: '' };

  return {
    main: words.slice(0, boundary).join(' '),
    ending: words.slice(boundary).join(' ')
  };
}

export function buildContentSocialImage(
  content: Omit<ContentSocialImage, 'key'>,
  background: number
): string {
  if (!Number.isInteger(background) || background < 1 || background > BACKGROUND_COUNT) {
    throw new RangeError(`Social image background must be between 1 and ${BACKGROUND_COUNT}.`);
  }

  const topics = [...new Set(content.topics.map((topic) => topic.trim()).filter(Boolean))];
  if (!topics.length) throw new Error('A social image needs at least one topic.');

  const title = splitSocialTitle(content.title);
  const topicLayer =
    `co_%23e83a47,l_text:Fira%20Mono_20:${encodeText(topics.join(' | '))}` +
    '/fl_layer_apply,g_north_west,x_60,y_60';
  const titleLayer =
    `w_630,c_fit,co_white,b_rgb:00000080,l_text:Archivo%20Black_60_line_spacing_-20:${encodeText(title.main)}` +
    '/fl_layer_apply,g_south_west,x_60,y_180';
  const layers = [topicLayer, titleLayer];

  if (title.ending) {
    layers.push(
      `bo_15px_solid_%23e83a47,b_%23e83a47,co_%23000000,l_text:Archivo%20Black_32:${encodeText(title.ending)},c_fit,w_600,h_50` +
        '/fl_layer_apply,g_south_west,x_60,y_100'
    );
  }

  return `${CLOUDINARY_BASE}/${layers.join('/')}/v1/ograph/ograph_${background}.png`;
}

export function assignContentSocialImages(
  content: readonly ContentSocialImage[]
): Map<string, string> {
  const ordered = [...content].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  );

  return new Map(
    ordered.map((item, index) => [
      item.key,
      buildContentSocialImage(item, (index % BACKGROUND_COUNT) + 1)
    ])
  );
}
