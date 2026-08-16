import { type Instrumentation } from 'next';
import { reportError } from '@/lib/observability';

/**
 * Next's native server-error hook — catches Server Component / route-handler
 * crashes that never reach a Server Action's own try/catch (so they'd
 * otherwise never hit reportError at all). Routes into the same seam as
 * every Server Action, so "how often are we failing" lives in one place.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request
) => {
  reportError(request.path, error);
};
