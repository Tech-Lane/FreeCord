import { Component, inject, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdminService, PendingUserDto } from '../../services/admin.service';

/**
 * Admin modal for approving or denying pending user registrations.
 * Shown only to server admins.
 */
@Component({
  selector: 'app-admin-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-modal.component.html',
  styleUrl: './admin-modal.component.scss'
})
export class AdminModalComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  readonly close = output<void>();

  pendingUsers = signal<PendingUserDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  actionInProgress = signal<string | null>(null);

  ngOnInit(): void {
    this.loadPending();
  }

  loadPending(): void {
    this.loading.set(true);
    this.error.set(null);
    this.admin.getPendingUsers().subscribe({
      next: (list) => {
        this.pendingUsers.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load pending users');
        this.loading.set(false);
      }
    });
  }

  approve(user: PendingUserDto): void {
    this.actionInProgress.set(user.id);
    this.admin.approveUser(user.id).subscribe({
      next: () => {
        this.pendingUsers.update((list) => list.filter((u) => u.id !== user.id));
        this.actionInProgress.set(null);
      },
      error: () => {
        this.actionInProgress.set(null);
      }
    });
  }

  deny(user: PendingUserDto): void {
    if (!confirm(`Are you sure you want to deny "${user.username}"? Their account will be removed.`)) {
      return;
    }
    this.actionInProgress.set(user.id);
    this.admin.denyUser(user.id).subscribe({
      next: () => {
        this.pendingUsers.update((list) => list.filter((u) => u.id !== user.id));
        this.actionInProgress.set(null);
      },
      error: () => {
        this.actionInProgress.set(null);
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }

  /** Navigate to the Server-wide Settings page and close the modal */
  navigateToServerSettings(): void {
    this.close.emit();
    this.router.navigate(['/app/admin/settings']);
  }

  /** Format date for display */
  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
}
