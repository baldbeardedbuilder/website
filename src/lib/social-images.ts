const CLOUDINARY_BASE = 'https://res.cloudinary.com/dk3rdh3yo/image/upload';
const BACKGROUND_COUNT = 6;

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

export function splitSocialTitle(title: string): { main: string; ending: string } {
  const normalized = title.trim().replace(/\s+/g, ' ');
  if (!normalized) throw new Error('A social image title cannot be empty.');

  const words = normalized.split(' ');
  const endingLength = Math.min(5, Math.max(1, Math.ceil(words.length * 0.4)));

  return {
    main: words.slice(0, -endingLength).join(' ') || normalized,
    ending: words.slice(-endingLength).join(' ')
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
  const endingLayer =
    `bo_15px_solid_%23e83a47,b_%23e83a47,co_%23000000,l_text:Archivo%20Black_32:${encodeText(title.ending)},c_fit,w_600,h_50` +
    '/fl_layer_apply,g_south_west,x_60,y_100';

  return `${CLOUDINARY_BASE}/${topicLayer}/${titleLayer}/${endingLayer}/v1/ograph/ograph_${background}.png`;
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
