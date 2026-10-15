// Smoke test for the browser-test runner: the dev server serves source modules, and the science core
// runs unchanged in the browser (rule 4: pure code, same results in Node and the browser).
export default async function run({ page, assert, log }) {
  const out = await page.evaluate(async () => {
    const units = await import('/src/science/units.ts');
    return units.binaryToSeconds('100110000110010000000000000000000');
  });
  log(`rotation period in the browser: ${out} s`);
  assert(Math.abs(out - 3.599944) < 1e-5, 'the cover rotation decodes to 3.59994 s in the browser');
}
