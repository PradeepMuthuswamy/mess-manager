import 'server-only';

import { cookies } from 'next/headers';
import { DEFAULT_UI_PREFERENCES, type UiPreferences } from './types';

export const UI_PREF_COOKIE = 'ui_prefs';

function isModalStyle(v: unknown): v is UiPreferences['modal_style'] {
  return v === 'dialog' || v === 'sheet';
}

export async function readUiPreferences(): Promise<UiPreferences> {
  const store = await cookies();
  const raw = store.get(UI_PREF_COOKIE)?.value;
  if (!raw) return DEFAULT_UI_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const candidate = parsed as Record<string, unknown>;
      const modal_style = isModalStyle(candidate.modal_style)
        ? candidate.modal_style
        : DEFAULT_UI_PREFERENCES.modal_style;
      return { modal_style };
    }
    return DEFAULT_UI_PREFERENCES;
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}
