import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * Payload emitted when a message is about to be rendered in the chat UI.
 * Plugins can transform content via the NexChatAPI.onMessageRendered hook.
 */
export interface MessageRenderedPayload {
  /** Original message content before any plugin transformation */
  content: string;
  /** Message ID */
  id: string;
  /** Channel ID */
  channelId: string;
  /** Author's display name */
  authorUsername: string;
  /** Author's user ID */
  authorId: string;
  /** ISO timestamp */
  createdAt: string;
  /** Edited timestamp if applicable */
  editedAt: string | null;
}

/**
 * Type for message content transformers registered by plugins.
 * Receives the current content (possibly already transformed by other plugins) and context.
 * Returns the transformed content to display, or a Promise for async transforms.
 */
export type MessageContentTransformer = (
  content: string,
  context: Omit<MessageRenderedPayload, 'content'>
) => string | Promise<string>;

/**
 * PluginEventBus provides a global RxJS-based event system for plugin hooks.
 * Events are emitted when specific app actions occur (e.g. message rendered).
 * Used internally by NexChatAPI and PluginLoaderService.
 */
@Injectable({ providedIn: 'root' })
export class PluginEventBusService {
  /** Subject for message render events. Fires before each message is displayed. */
  private readonly messageRenderedSubject = new Subject<MessageRenderedPayload>();

  /** Observable of message render events. Internal use by PluginLoaderService. */
  readonly onMessageRendered$: Observable<MessageRenderedPayload> =
    this.messageRenderedSubject.asObservable();

  /** Registered content transformers. Applied in order before display. */
  private contentTransformers: MessageContentTransformer[] = [];

  /**
   * Emits a message-rendered event. Called by ChatAreaComponent before displaying a message.
   */
  emitMessageRendered(payload: MessageRenderedPayload): void {
    this.messageRenderedSubject.next(payload);
  }

  /**
   * Registers a content transformer. Plugins call this via NexChatAPI.onMessageRendered.
   * Transformers are applied in registration order.
   */
  registerContentTransformer(transformer: MessageContentTransformer): void {
    this.contentTransformers.push(transformer);
  }

  /**
   * Applies all registered transformers to the given content.
   * Runs synchronously if all transformers are sync; supports async transformers.
   */
  async applyContentTransformers(
    content: string,
    context: Omit<MessageRenderedPayload, 'content'>
  ): Promise<string> {
    let result = content;
    for (const transformer of this.contentTransformers) {
      result = await Promise.resolve(transformer(result, context));
      if (typeof result !== 'string') {
        result = String(result ?? '');
      }
    }
    return result;
  }

  /**
   * Unregisters a transformer. Useful for plugin teardown (future use).
   */
  unregisterContentTransformer(transformer: MessageContentTransformer): void {
    this.contentTransformers = this.contentTransformers.filter((t) => t !== transformer);
  }
}
