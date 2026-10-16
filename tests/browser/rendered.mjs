// Shared by the browser bots (not a test file itself).
/** A checker message as the page shows it: quantity tokens rendered with the current gloss (src/ui/message.ts). */
export const renderedMessage = (page, message) =>
  page.evaluate(async (m) => {
    const { renderMessage } = await import('/src/ui/message.ts');
    const { game } = await import('/src/game/state.ts');
    return renderMessage(m, game.settings.value.humanGloss);
  }, message);

/**
 * A refused result is shown as one verdict line with the rest folded beneath it (src/ui/verdict.ts): the page's
 * own split of a checker message, rendered. A test then looks for the lead and for the start of the rest.
 */
export const renderedVerdict = (page, message) =>
  page.evaluate(async (m) => {
    const { renderMessage } = await import('/src/ui/message.ts');
    const { splitVerdict } = await import('/src/ui/verdict.ts');
    const { game } = await import('/src/game/state.ts');
    return splitVerdict(renderMessage(m, game.settings.value.humanGloss));
  }, message);

/** Whether a result element's text (folded parts included) holds a message's verdict line and the start of the rest. */
export const showsVerdict = (text, v) => {
  const flat = text.replace(/\s+/g, ' ');
  const start = (s) => s.replace(/\s+/g, ' ').slice(0, 40);
  return flat.includes(start(v.lead)) && (v.rest === '' || flat.includes(start(v.rest)));
};
