import { Pipe, PipeTransform, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { PluginLoaderService } from '../services/plugin-loader.service';
import type { MessageReceivedPayload } from '../services/chat-hub.service';

/**
 * Pipe that transforms message content through the plugin formatting pipeline.
 * Use with the async pipe since formatMessageContent is async.
 *
 * Example:
 *   {{ msg | formatMessageContent | async }}
 */
@Pipe({
  name: 'formatMessageContent',
  standalone: true
})
export class FormatMessageContentPipe implements PipeTransform {
  private readonly pluginLoader = inject(PluginLoaderService);

  transform(msg: MessageReceivedPayload | null | undefined): Observable<string> {
    if (!msg) {
      return from(Promise.resolve(''));
    }
    return from(
      this.pluginLoader.formatMessageContent(msg.content, {
        id: msg.id,
        channelId: msg.channelId,
        authorUsername: msg.authorUsername,
        authorId: msg.authorId,
        createdAt: msg.createdAt,
        editedAt: msg.editedAt ?? null
      })
    );
  }
}
