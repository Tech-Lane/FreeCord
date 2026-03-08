import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

/**
 * CreateInviteModalComponent provides a UI for creating guild invite links.
 * - Calls POST /api/guilds/{guildId}/invites to generate a secure invite code
 * - Displays the resulting shortlink (nexchat://invite/abc123)
 * - Copies the shortlink to the user's clipboard on success
 * - Emits close when dismissed
 */
@Component({
  selector: 'app-create-invite-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './create-invite-modal.component.html',
  styleUrl: './create-invite-modal.component.scss'
})
export class CreateInviteModalComponent {
  private readonly api = inject(ApiService);

  /** Guild ID to create an invite for */
  @Input({ required: true }) guildId!: string;

  /** Emits when the user closes the modal */
  @Output() close = new EventEmitter<void>();

  /** Whether we are creating an invite */
  creating = false;

  /** Generated shortlink after success */
  shortlink = signal<string | null>(null);

  /** Copy success feedback */
  copied = signal(false);

  /** Error message from create or copy */
  error = signal<string | null>(null);

  /**
   * Creates an invite and copies the shortlink to clipboard.
   * Uses navigator.clipboard when available (HTTPS or localhost).
   */
  async createAndCopy(): Promise<void> {
    this.error.set(null);
    this.creating = true;

    this.api.createInvite(this.guildId).subscribe({
      next: async (res) => {
        this.creating = false;
        if (!res) {
          this.error.set('Failed to create invite.');
          return;
        }
        this.shortlink.set(res.shortlink);
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(res.shortlink);
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 2000);
          }
        } catch {
          this.error.set('Invite created, but could not copy to clipboard.');
        }
      },
      error: () => {
        this.creating = false;
        this.error.set('Failed to create invite.');
      }
    });
  }

  /** Copy shortlink to clipboard (manual copy after creation) */
  async copyToClipboard(): Promise<void> {
    const link = this.shortlink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.error.set('Could not copy to clipboard.');
    }
  }

  /** Close the modal */
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
