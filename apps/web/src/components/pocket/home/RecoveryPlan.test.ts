import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecoveryPlan } from './RecoveryPlan';

/**
 * RecoveryPlan is an async Server Component using `getTranslations` (server
 * next-intl, mocked by setup-intl-server.ts for this node-environment test
 * project). No jsdom needed — `renderToStaticMarkup` is enough to inspect
 * the rendered copy.
 */
describe('RecoveryPlan', () => {
  it('does not suggest a reduced cap when no cap has been set yet (cap=0)', async () => {
    // A brand-new household with no budget_settings row coerces to cap=0
    // (summary.ts:47); any spend then makes overspend = spent and
    // recoveryCap = max(0 - spent, 0) = 0. Without the cap > 0 guard,
    // `0 >= 0 * 0.5` is vacuously true and the app would suggest "start
    // next month at 0".
    const el = await RecoveryPlan({
      cap: 0,
      overspend: 1200,
      recoveryCap: 0,
      daysLeft: 10,
      currency: 'RSD',
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('No math to do');
    expect(html).not.toContain('Want to even out');
  });

  it('still suggests a reduced cap for a real cap with a small overspend', async () => {
    const el = await RecoveryPlan({
      cap: 100_000,
      overspend: 4_200,
      recoveryCap: 95_800,
      daysLeft: 10,
      currency: 'RSD',
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('Want to even out');
  });
});
