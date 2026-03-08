import {
  Component,
  EventEmitter,
  Output,
  inject,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';

/**
 * Core CSS variables exposed as color pickers in the theme editor.
 * Maps variable names to their default hex values from styles.scss.
 */
export const THEME_VARIABLE_DEFAULTS: Record<string, string> = {
  '--bg-primary': '#313338',
  '--bg-secondary': '#2b2d31',
  '--accent-color': '#5865f2',
  '--text-main': '#f2f3f5',
  '--text-muted': '#b5bac1',
  '--text-on-accent': '#ffffff'
};

/**
 * ThemeSettingsModalComponent provides a UI for customizing the user's theme.
 * - Color pickers map to core CSS variables (--bg-primary, --text-accent, etc.)
 * - Text area for custom CSS
 * - Preview area shows changes instantly; uses ThemeService.sanitizeCss for safety
 * - On save: HTTP PUT to /api/users/me/theme; applies theme via ThemeService
 */
@Component({
  selector: 'app-theme-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './theme-settings-modal.component.html',
  styleUrl: './theme-settings-modal.component.scss'
})
export class ThemeSettingsModalComponent implements OnInit, AfterViewChecked {
  private readonly api = inject(ApiService);
  private readonly themeService = inject(ThemeService);

  /** Emits when the user closes the modal (Cancel or backdrop click) */
  @Output() close = new EventEmitter<void>();

  /** Reference to the preview container for scoped style injection */
  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;

  /** Custom CSS from the text area (raw input) */
  customCss = '';

  /** Color picker values keyed by CSS variable name */
  colorValues = signal<Record<string, string>>({ ...THEME_VARIABLE_DEFAULTS });

  /** Sanitized custom CSS for preview (scoped to .theme-preview-area) */
  private previewCss = '';

  /** Whether a save is in progress */
  saving = false;

  /** Error message from save, if any */
  saveError = '';

  /** Inline style string for the preview area (CSS variables from color pickers) */
  readonly previewStyle = computed(() => {
    const vars = this.colorValues();
    return Object.entries(vars)
      .map(([key, val]) => `${key}: ${val}`)
      .join('; ');
  });

  /** Label for each variable (human-readable) */
  readonly variableLabels: Record<string, string> = {
    '--bg-primary': 'Background primary',
    '--bg-secondary': 'Background secondary',
    '--accent-color': 'Accent color',
    '--text-main': 'Text main',
    '--text-muted': 'Text muted',
    '--text-on-accent': 'Text on accent'
  };

  /** Variable keys in display order */
  readonly variableKeys = Object.keys(THEME_VARIABLE_DEFAULTS);

  /** Track if we need to update the preview style tag (after custom CSS change) */
  private needsPreviewUpdate = false;

  ngOnInit(): void {
    this.api.getUserProfile().subscribe((profile) => {
      if (profile?.customThemeCss) {
        const parsed = this.parseThemeCss(profile.customThemeCss);
        this.customCss = parsed.customCss;
        this.colorValues.set({ ...THEME_VARIABLE_DEFAULTS, ...parsed.variables });
        this.needsPreviewUpdate = true;
      }
    });
  }

  /**
   * Parses saved theme CSS to extract variable values for pickers and the remainder for the text area.
   * Uses simple regex to find --var-name: value. Only hex values are used for pickers (HTML color input expects hex).
   */
  private parseThemeCss(css: string): { variables: Record<string, string>; customCss: string } {
    const variables: Record<string, string> = {};
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const key of this.variableKeys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${escaped}\\s*:\\s*([^;}\\s]+)`, 'i');
      const match = css.match(re);
      const val = match?.[1]?.trim();
      if (val && hexRegex.test(val)) {
        variables[key] = val;
      }
    }
    /* Remove the first :root { ... } block so we regenerate it from pickers on save */
    const withoutFirstRoot = css.replace(
      /:root\s*\{[^}]*\}\s*/,
      ''
    ).trim();
    return { variables, customCss: withoutFirstRoot || css };
  }

  ngAfterViewChecked(): void {
    if (this.needsPreviewUpdate && this.previewContainer) {
      this.injectPreviewStyles();
      this.needsPreviewUpdate = false;
    }
  }

  /** Update a single color variable from a picker */
  onColorChange(variable: string, value: string): void {
    this.colorValues.update((prev) => ({ ...prev, [variable]: value }));
  }

  /** Update custom CSS and mark preview for refresh */
  onCustomCssChange(): void {
    this.needsPreviewUpdate = true;
  }

  /**
   * Injects sanitized custom CSS into the preview container.
   * Replaces :root with .theme-preview-area so styles apply only to the preview.
   */
  private injectPreviewStyles(): void {
    if (!this.previewContainer?.nativeElement) return;

    const sanitized = this.themeService.sanitizeCss(this.customCss);
    const scoped = this.scopeCssForPreview(sanitized);
    this.previewCss = scoped;

    const existing = this.previewContainer.nativeElement.querySelector(
      'style[data-theme-preview]'
    );
    if (existing) existing.remove();

    if (scoped.trim()) {
      const style = document.createElement('style');
      style.setAttribute('data-theme-preview', '');
      style.textContent = scoped;
      this.previewContainer.nativeElement.appendChild(style);
    }
  }

  /**
   * Scopes user CSS so :root and html apply to the preview container.
   */
  private scopeCssForPreview(css: string): string {
    return css
      .replace(/:root\b/g, '.theme-preview-area')
      .replace(/\bhtml\b/g, '.theme-preview-area');
  }

  /** Build the full theme CSS to save: variable overrides + custom CSS */
  private buildThemeCss(): string {
    const vars = this.colorValues();
    const varBlock = Object.entries(vars)
      .map(([key, val]) => `  ${key}: ${val};`)
      .join('\n');
    const base = `:root {\n${varBlock}\n}\n\n`;
    return base + this.customCss;
  }

  /** Save theme to API and apply globally */
  save(): void {
    this.saveError = '';
    this.saving = true;

    const fullCss = this.buildThemeCss();

    this.api.updateUserTheme(fullCss).subscribe({
      next: (res) => {
        this.saving = false;
        if (res) {
          this.themeService.applyCustomTheme(res.customThemeCss, 'current-user');
          this.close.emit();
        } else {
          this.saveError = 'Failed to save theme.';
        }
      },
      error: () => {
        this.saving = false;
        this.saveError = 'Failed to save theme.';
      }
    });
  }

  /** Close the modal without saving */
  cancel(): void {
    this.close.emit();
  }

  /** Handle backdrop click to close */
  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
