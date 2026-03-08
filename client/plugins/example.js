/**
 * Example FreeCord plugin - copy to ~/.freecord/plugins/ to enable.
 *
 * This plugin demonstrates how to use window.NexChatAPI to transform
 * message content before it is displayed in the chat UI.
 */

(function (NexChatAPI) {
  'use strict';

  if (!NexChatAPI || typeof NexChatAPI.onMessageRendered !== 'function') {
    console.warn('[example-plugin] NexChatAPI not available');
    return;
  }

  NexChatAPI.onMessageRendered(function (content, context) {
    // Example: wrap code-like text in backticks for monospace styling
    if (content.startsWith('/') && content.length > 1) {
      return '`' + content + '`';
    }
    return content;
  });

  console.log('[example-plugin] Loaded successfully');
})(typeof window !== 'undefined' ? window.NexChatAPI : undefined);
