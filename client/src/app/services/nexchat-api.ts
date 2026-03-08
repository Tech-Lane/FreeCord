import type { MessageContentTransformer } from './plugin-event-bus.service';

/**
 * Read-only context passed to plugins when a message is rendered.
 */
export interface MessageContext {
  id: string;
  channelId: string;
  authorUsername: string;
  authorId: string;
  createdAt: string;
  editedAt: string | null;
}

/**
 * NexChatAPI is the safe, isolated API surface exposed to plugins via window.NexChatAPI.
 * Plugins receive this object and can only hook into defined events and transformers.
 * All methods are intentionally minimal to reduce attack surface.
 */
export interface NexChatAPI {
  /**
   * Registers a callback to transform message content before it is displayed.
   * The callback receives (content, context) and must return the transformed content
   * (or a Promise thereof). Multiple plugins are applied in registration order.
   */
  onMessageRendered: (callback: MessageContentTransformer) => void;

  /**
   * Plugin API version for compatibility checking.
   */
  version: string;
}

/** Current API version. Bump when breaking changes are introduced. */
export const NEXCHAT_API_VERSION = '1.0.0';

/**
 * Creates the NexChatAPI object that is exposed to plugins.
 * Uses a registration callback to avoid circular dependency on PluginEventBusService.
 */
export function createNexChatAPI(
  registerTransformer: (fn: MessageContentTransformer) => void
): NexChatAPI {
  const api: NexChatAPI = {
    version: NEXCHAT_API_VERSION,
    onMessageRendered(callback: MessageContentTransformer) {
      if (typeof callback !== 'function') {
        console.warn('[NexChatAPI] onMessageRendered requires a function');
        return;
      }
      registerTransformer(callback);
    }
  };

  return Object.freeze(api);
}
