// Shared by the browser bots (not a test file itself).
/** A checker message as the page shows it: quantity tokens rendered with the current gloss (src/ui/message.ts). */
export const renderedMessage = (page, message) =>
  page.evaluate(async (m) => {
    const { renderMessage } = await import('/src/ui/message.ts');
    const { game } = await import('/src/game/state.ts');
    return renderMessage(m, game.settings.value.humanGloss);
  }, message);
