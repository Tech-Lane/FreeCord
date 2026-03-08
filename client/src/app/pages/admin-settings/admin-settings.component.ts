import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminSettingsService,
  AdminSettings,
  DEFAULT_ADMIN_SETTINGS
} from '../../services/admin-settings.service';

/**
 * Admin Settings page: server-wide preferences (client-side only).
 * Available only to server admins; guarded by adminGuard.
 * Settings are persisted in localStorage via AdminSettingsService.
 */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss'
})
export class AdminSettingsComponent implements OnInit {
  private readonly adminSettings = inject(AdminSettingsService);

  /** Local copy of settings for the form */
  settings = signal<AdminSettings>({ ...DEFAULT_ADMIN_SETTINGS });

  /** Show a brief "Saved" confirmation after save */
  savedFeedback = signal(false);

  /** Defaults reference for reset and template */
  readonly defaults = DEFAULT_ADMIN_SETTINGS;

  ngOnInit(): void {
    this.settings.set(this.adminSettings.getSettings());
  }

  /** Persist current form state to localStorage */
  save(): void {
    this.adminSettings.saveSettings(this.settings());
    this.savedFeedback.set(true);
    setTimeout(() => this.savedFeedback.set(false), 2000);
  }

  /** Reset to defaults and persist */
  resetToDefaults(): void {
    if (!confirm('Reset all server settings to defaults? This cannot be undone.')) {
      return;
    }
    this.adminSettings.resetToDefaults();
    this.settings.set(this.adminSettings.getSettings());
    this.savedFeedback.set(true);
    setTimeout(() => this.savedFeedback.set(false), 2000);
  }

  /** Update a single key in settings (for ngModel-style two-way binding we use methods + events) */
  update<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]): void {
    const current = this.defaults[key];
    if (typeof current === 'number' && typeof value !== 'number') {
      value = Number(value) as AdminSettings[K];
    }
    this.settings.update((s) => ({ ...s, [key]: value }));
  }
}
