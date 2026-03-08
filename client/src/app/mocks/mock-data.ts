/**
 * Mock data for UI-only mode.
 * Used when environment.uiOnly is true so the Angular app can run without the backend.
 * Provides guilds, channels, messages, and user profile for realistic UI development.
 */

import type { GuildDto, ChannelDto, MessageDto } from '../services/api.service';
import type { UserProfile } from '../services/auth.service';
import type { MessageReceivedPayload } from '../services/chat-hub.service';

/** Mock current user (UI-only mode) */
export const MOCK_USER: UserProfile = {
  id: 'user-mock-1',
  username: 'DemoUser',
  customThemeCss: '',
  isServerAdmin: true
};

/** Mock JWT placeholder for UI-only mode */
export const MOCK_TOKEN = 'mock-jwt-ui-only';

/** Mock guilds (servers) */
export const MOCK_GUILDS: GuildDto[] = [
  { id: 'guild-1', name: 'FreeCord Dev', ownerId: MOCK_USER.id },
  { id: 'guild-2', name: 'Gaming Squad', ownerId: 'user-mock-2' },
  { id: 'guild-3', name: 'Open Source', ownerId: MOCK_USER.id }
];

/** Mock channels per guild: id -> list of channels */
export const MOCK_CHANNELS: Record<string, ChannelDto[]> = {
  'guild-1': [
    { id: 'ch-1-1', name: 'general', type: 'Text', position: 0 },
    { id: 'ch-1-2', name: 'random', type: 'Text', position: 1 },
    { id: 'ch-1-3', name: 'dev-chat', type: 'Text', position: 2 },
    { id: 'ch-1-4', name: 'Voice Lounge', type: 'Voice', position: 3 },
    { id: 'ch-1-5', name: 'Support', type: 'Text', position: 4 }
  ],
  'guild-2': [
    { id: 'ch-2-1', name: 'lobby', type: 'Text', position: 0 },
    { id: 'ch-2-2', name: 'clips', type: 'Text', position: 1 },
    { id: 'ch-2-3', name: 'Gaming Voice', type: 'Voice', position: 2 }
  ],
  'guild-3': [
    { id: 'ch-3-1', name: 'welcome', type: 'Text', position: 0 },
    { id: 'ch-3-2', name: 'contributors', type: 'Text', position: 1 },
    { id: 'ch-3-3', name: 'General Voice', type: 'Voice', position: 2 }
  ]
};

/** Mock message authors for variety */
const MOCK_AUTHORS: Array<{ id: string; username: string }> = [
  { id: MOCK_USER.id, username: MOCK_USER.username },
  { id: 'user-mock-2', username: 'AlexDev' },
  { id: 'user-mock-3', username: 'CodingCat' },
  { id: 'user-mock-4', username: 'TechWizard' },
  { id: 'user-mock-5', username: 'PixelArt' }
];

/** Base timestamp for mock messages (recent) */
const now = new Date();
const ts = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60 * 1000).toISOString();

/**
 * Builds mock messages for a channel. Each channel gets a different set of messages.
 */
function buildMockMessagesForChannel(channelId: string, guildId: string): MessageDto[] {
  const authors = MOCK_AUTHORS;
  const templates: Record<string, string[]> = {
    'ch-1-1': [
      'Hey everyone! Welcome to the FreeCord dev server.',
      'Has anyone tried the new UI-only mode? Makes frontend tweaks so much easier.',
      'I just pushed a fix for the theme selector. Let me know if you see any issues.',
      'We should add more mock channels for the voice panel too.',
      'Sounds good. I\'ll run the client with `ng serve --configuration=ui-only` and check.'
    ],
    'ch-1-2': [
      'Random thought: what if we added plugin support for custom themes?',
      'That would be cool. Or per-channel themes?',
      'Let\'s keep it simple for v1 😄',
      'Anyone up for a quick voice test later?'
    ],
    'ch-1-3': [
      'Debug tip: use the browser devtools to inspect SignalR messages.',
      'Also check the Network tab for REST calls when not in ui-only mode.',
      'Good point. And the Redux devtools if we add state management.'
    ],
    'ch-1-4': [],
    'ch-1-5': [
      'For support, please describe your setup (OS, Node version, etc.).',
      'We typically respond within 24–48 hours. Thanks!'
    ],
    'ch-2-1': [
      'Who\'s online for a round?',
      'I\'m in! Give me 2 mins.',
      'Same here, just finishing a build.'
    ],
    'ch-2-2': [
      'Check out this clip from last night\'s session.',
      'Nice one! 🔥',
      'We should pin the best clips.'
    ],
    'ch-2-3': [],
    'ch-3-1': [
      'Welcome to the Open Source server!',
      'Please read the rules and introduce yourself in #contributors.',
      'Thanks for having me! Excited to contribute.'
    ],
    'ch-3-2': [
      'I\'m working on the API docs this week.',
      'I can take the client docs if that helps.',
      'We could add a CONTRIBUTING.md with ui-only instructions.'
    ],
    'ch-3-3': []
  };

  const lines = templates[channelId] ?? ['No messages yet.'];
  const base = channelId === 'ch-1-1' ? 100 : channelId === 'ch-1-2' ? 200 : 300;
  return lines.map((content, i) => {
    const author = authors[i % authors.length];
    return {
      id: `msg-${channelId}-${base + i}`,
      channelId,
      authorId: author.id,
      authorUsername: author.username,
      content,
      createdAt: ts((lines.length - i) * 15),
      editedAt: null,
      attachmentUrl: null
    };
  });
}

/** Precomputed messages per channel for quick lookup */
const MOCK_MESSAGES_BY_CHANNEL: Record<string, MessageDto[]> = (() => {
  const out: Record<string, MessageDto[]> = {};
  for (const guildId of Object.keys(MOCK_CHANNELS)) {
    for (const ch of MOCK_CHANNELS[guildId]) {
      out[ch.id] = buildMockMessagesForChannel(ch.id, guildId);
    }
  }
  return out;
})();

/**
 * Returns mock guilds for UI-only mode.
 */
export function getMockGuilds(): GuildDto[] {
  return [...MOCK_GUILDS];
}

/**
 * Returns mock channels for a guild, or empty array if unknown.
 */
export function getMockChannels(guildId: string): ChannelDto[] {
  return [...(MOCK_CHANNELS[guildId] ?? [])];
}

/**
 * Returns the name of a channel in a guild for UI-only mode (e.g. for header when state.channels not yet loaded).
 */
export function getMockChannelName(guildId: string, channelId: string): string | null {
  const ch = MOCK_CHANNELS[guildId]?.find((c) => c.id === channelId);
  return ch?.name ?? null;
}

/**
 * Returns mock messages for a channel in MessageDto form (REST shape).
 */
export function getMockMessagesDto(channelId: string): MessageDto[] {
  return [...(MOCK_MESSAGES_BY_CHANNEL[channelId] ?? [])];
}

/**
 * Returns mock messages for a channel in MessageReceivedPayload form (SignalR shape).
 */
export function getMockMessagesPayload(channelId: string): MessageReceivedPayload[] {
  const dtos = MOCK_MESSAGES_BY_CHANNEL[channelId] ?? [];
  return dtos.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    authorUsername: m.authorUsername,
    content: m.content,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    attachmentUrl: m.attachmentUrl ?? null
  }));
}

/**
 * Full permission bitfield for mock user (e.g. ManageGuild, CreateInstantInvite, ManageChannels).
 * Value 0x8 | 0x20 | 0x10 = 56 or use a higher value for "all" in dev.
 */
export const MOCK_PERMISSIONS = 0x7fffffff;
