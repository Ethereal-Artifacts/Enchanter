import { enchanterInformationCopy } from './localization';

/** Copy is data, not markup; only the translated feel phrase is italicized. */
function escapeHTML(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
export function informationFor(language: string): { header: string; html: string } {
  const copy = enchanterInformationCopy(language);
  return {
    header: copy.header,
    html: copy.paragraphs.map(paragraph => `<p>${escapeHTML(paragraph)}</p>`).join('\n')
      + `<p class="information-dedication"><br>${escapeHTML(copy.dedicationBefore)}<em>${escapeHTML(copy.dedicationEmphasis)}</em>${escapeHTML(copy.dedicationAfter).replaceAll("\n", "<br>")}</p>`
  };
}
export const informationHeader = informationFor('en').header;
export const informationHTML = informationFor('en').html;
