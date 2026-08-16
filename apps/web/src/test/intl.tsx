/**
 * jsdom component tests render client components that call `useTranslations`
 * (a React context hook, not a Next request API), so wrapping in the real
 * `NextIntlClientProvider` with the real `en.json` is enough — no mocking
 * needed, and it exercises the actual message strings/ICU/rich-text tags.
 */
import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';

export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  });
}

export * from '@testing-library/react';
