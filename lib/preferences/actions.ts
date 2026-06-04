'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-role';
import {
  DEFAULT_UI_PREFERENCES,
  type UiPreferences,
  type ModalStyle,
} from './types';
import { UI_PREF_COOKIE, readUiPreferences } from './cookie';

function sanitizeModalStyle(v: unknown): ModalStyle | undefined {
  return v === 'dialog' || v === 'sheet' ? v : undefined;
}

export async function setUiPreferenceAction(
  input: Partial<UiPreferences>,
): Promise<{ ok: true; prefs: UiPreferences } | { error: string }> {
  try {
    await requireUser();

    const current = await readUiPreferences();
    const next: UiPreferences = {
      ...current,
      ...(sanitizeModalStyle(input.modal_style)
        ? { modal_style: sanitizeModalStyle(input.modal_style) as ModalStyle }
        : {}),
    };

    // Guarantee we always write a valid shape.
    const safe: UiPreferences = {
      modal_style: sanitizeModalStyle(next.modal_style) ?? DEFAULT_UI_PREFERENCES.modal_style,
    };

    const store = await cookies();
    store.set(UI_PREF_COOKIE, JSON.stringify(safe), {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
    });

    revalidatePath('/');

    return { ok: true, prefs: safe };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save preference';
    return { error: message };
  }
}
