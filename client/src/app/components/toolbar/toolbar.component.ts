import { Component, inject, input, signal, output, ElementRef, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * Top application toolbar. Shown in the main layout above the three-column area.
 * Includes: app branding, search (placeholder), notifications (placeholder),
 * help (placeholder), admin settings link (when server admin), and user menu (theme, logout).
 * All actions are client-side; backend features (e.g. search, notifications) can be added later.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss'
})
export class ToolbarComponent {
  private readonly auth = inject(AuthService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /** When true, show the Server settings (admin) button in the toolbar. */
  readonly isServerAdmin = input<boolean>(false);

  /** Emitted when the user requests theme settings (parent opens ThemeSettingsModal). */
  readonly openThemeSettings = output<void>();

  /** Whether the user dropdown menu is open (toggle on avatar/username click). */
  readonly userMenuOpen = signal(false);

  /** Current username from AuthService for display in toolbar. */
  readonly username = this.auth.username;

  /** Open the theme settings modal (delegate to parent). */
  onOpenThemeSettings(): void {
    this.userMenuOpen.set(false);
    this.openThemeSettings.emit();
  }

  /** Toggle user menu visibility. */
  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  /** Close user menu (e.g. when clicking outside; can be wired via overlay later). */
  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  /** Log out and navigate to login (AuthService handles redirect). */
  logout(): void {
    this.userMenuOpen.set(false);
    this.auth.logout();
  }

  /** Close user menu when clicking outside the toolbar user-menu area. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const el = this.elementRef.nativeElement;
    const target = event.target as Node;
    if (el.contains(target)) return;
    this.closeUserMenu();
  }

  /** Placeholder: search not implemented yet (client-side only). */
  onSearch(): void {
    // Future: open search overlay or focus search input
  }

  /** Placeholder: notifications not implemented yet. */
  onNotifications(): void {
    // Future: open notifications panel
  }

  /** Placeholder: help not implemented yet. */
  onHelp(): void {
    // Future: open help/docs or external link
  }
}
