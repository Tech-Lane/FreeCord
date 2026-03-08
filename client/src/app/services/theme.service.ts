import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Element ID for the dynamically injected custom theme style tag */
const CUSTOM_THEME_STYLE_ID = 'freecord-custom-theme';

/**
 * ThemeService intercepts CustomThemeCss from user/server profiles, sanitizes it
 * to prevent XSS, and dynamically injects it into the DOM.
 *
 * Security: Only allows safe CSS. Strips javascript:, expression(), -moz-binding,
 * behavior, vbscript:, and other dangerous patterns that could execute code.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  /**
   * Patterns that could execute script or cause XSS via CSS.
   * Case-insensitive matching for defense in depth.
   */
  private static readonly UNSAFE_PATTERNS = [
    /\bjavascript\s*:/gi,
    /\bvbscript\s*:/gi,
    /\bdata\s*:\s*text\/html/gi,
    /\bexpression\s*\(/gi,
    /\b-moz-binding\s*:/gi,
    /\bbehavior\s*:/gi,
    /\burl\s*\(\s*["']?\s*javascript/gi,
    /\burl\s*\(\s*["']?\s*vbscript/gi,
    /<\s*script/gi,
    /@\s*import\s+["']?\s*http/gi
  ];

  /**
   * Applies custom theme CSS from a user or server profile.
   * Call when viewing a different user profile or switching servers to apply
   * their CustomThemeCss. Sanitizes input before injection.
   *
   * @param customThemeCss - Raw CSS string from database (e.g., user.CustomThemeCss)
   * @param scopeId - Optional identifier for scoping (e.g., userId, guildId)
   */
  applyCustomTheme(customThemeCss: string | null | undefined, scopeId?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.removeCustomTheme();

    if (!customThemeCss || typeof customThemeCss !== 'string') return;

    const sanitized = this.sanitizeCss(customThemeCss);
    if (!sanitized.trim()) return;

    const style = document.createElement('style');
    style.id = scopeId ? `${CUSTOM_THEME_STYLE_ID}-${scopeId}` : CUSTOM_THEME_STYLE_ID;
    style.setAttribute('data-freecord-theme', 'custom');
    style.textContent = sanitized;
    document.head.appendChild(style);
  }

  /**
   * Removes any injected custom theme from the DOM.
   */
  removeCustomTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const existing = document.querySelector(`[id="${CUSTOM_THEME_STYLE_ID}"], [id^="${CUSTOM_THEME_STYLE_ID}-"]`);
    existing?.remove();
  }

  /**
   * Sanitizes CSS to prevent XSS. Removes known dangerous patterns.
   * Uses allowlist approach: only safe CSS remains.
   */
  private sanitizeCss(css: string): string {
    let result = css;

    for (const pattern of ThemeService.UNSAFE_PATTERNS) {
      result = result.replace(pattern, '');
    }

    /* Limit length to mitigate DoS via extremely long CSS */
    const maxLength = 64 * 1024; // 64KB
    if (result.length > maxLength) {
      result = result.slice(0, maxLength);
    }

    return result;
  }
}
