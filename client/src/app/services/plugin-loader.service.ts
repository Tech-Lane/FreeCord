import { Injectable, inject } from '@angular/core';
import { BaseDirectory, exists, readDir, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { PluginEventBusService } from './plugin-event-bus.service';
import { createNexChatAPI } from './nexchat-api';

/** Default plugins directory: ~/.freecord/plugins (or %USERPROFILE%\.freecord\plugins on Windows) */
const PLUGINS_DIR = '.freecord/plugins';

/** Declare global NexChatAPI for TypeScript. Set at runtime by PluginLoaderService. */
declare global {
  interface Window {
    NexChatAPI?: import('./nexchat-api').NexChatAPI;
  }
}

/**
 * PluginLoaderService loads and initializes client-side plugins from the local filesystem.
 * On startup, it reads ~/.freecord/plugins, discovers .js files, and executes them with
 * a safe window.NexChatAPI object for hooks (e.g. onMessageRendered).
 *
 * Requires Tauri (desktop) environment; no-op when running in a browser.
 */
@Injectable({ providedIn: 'root' })
export class PluginLoaderService {
  private readonly eventBus = inject(PluginEventBusService);

  /** Whether the loader has run. Used to avoid duplicate initialization. */
  private initialized = false;

  /** Names of successfully loaded plugins for logging/debugging. */
  private loadedPlugins: string[] = [];

  /**
   * Initializes the plugin system: creates window.NexChatAPI and loads all .js plugins.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Guard: Tauri APIs are only available in the Tauri desktop context
    if (typeof window === 'undefined' || !this.isTauriEnvironment()) {
      return;
    }

    try {
      this.setupNexChatAPI();
      await this.ensurePluginsDirectory();
      await this.loadPlugins();
    } catch (err) {
      console.error('[PluginLoader] Failed to initialize:', err);
    }
  }

  /**
   * Checks if the app is running inside Tauri (desktop) rather than a plain browser.
   */
  private isTauriEnvironment(): boolean {
    return !!(
      (window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INVOKE__?: unknown }).__TAURI_INVOKE__
    );
  }

  /**
   * Creates and attaches the NexChatAPI object to window for plugin access.
   */
  private setupNexChatAPI(): void {
    const api = createNexChatAPI((fn) => this.eventBus.registerContentTransformer(fn));
    Object.defineProperty(window, 'NexChatAPI', {
      value: api,
      writable: false,
      configurable: false
    });
  }

  /**
   * Ensures the plugins directory exists. Creates it if missing.
   */
  private async ensurePluginsDirectory(): Promise<void> {
    const dirExists = await exists(PLUGINS_DIR, { baseDir: BaseDirectory.Home });
    if (!dirExists) {
      await mkdir(PLUGINS_DIR, { baseDir: BaseDirectory.Home, recursive: true });
    }
  }

  /**
   * Discovers and loads all .js files from the plugins directory.
   */
  private async loadPlugins(): Promise<void> {
    let entries: { name: string; isFile: boolean }[];
    try {
      entries = await readDir(PLUGINS_DIR, { baseDir: BaseDirectory.Home });
    } catch (err) {
      console.warn('[PluginLoader] Could not read plugins directory:', err);
      return;
    }

    const jsFiles = entries
      .filter((e) => e.isFile && e.name.toLowerCase().endsWith('.js'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of jsFiles) {
      await this.loadPlugin(entry.name);
    }

    if (this.loadedPlugins.length > 0) {
      console.info('[PluginLoader] Loaded plugins:', this.loadedPlugins.join(', '));
    }
  }

  /**
   * Loads a single plugin by name. Reads the file and executes it with NexChatAPI in scope.
   */
  private async loadPlugin(filename: string): Promise<void> {
    const path = `${PLUGINS_DIR}/${filename}`;
    let source: string;
    try {
      source = await readTextFile(path, { baseDir: BaseDirectory.Home });
    } catch (err) {
      console.warn(`[PluginLoader] Could not read ${filename}:`, err);
      return;
    }

    const api = window.NexChatAPI;
    if (!api) {
      console.warn('[PluginLoader] NexChatAPI not available; skipping', filename);
      return;
    }

    try {
      // Execute in an isolated scope. The plugin receives only NexChatAPI.
      // Using Function constructor creates a new scope; the script cannot access
      // other globals unless we pass them. We only pass NexChatAPI.
      const fn = new Function('NexChatAPI', `
        "use strict";
        ${source}
      `);
      fn(api);
      this.loadedPlugins.push(filename);
    } catch (err) {
      console.error(`[PluginLoader] Error executing ${filename}:`, err);
    }
  }

  /**
   * Returns the list of successfully loaded plugin filenames.
   */
  getLoadedPlugins(): readonly string[] {
    return [...this.loadedPlugins];
  }

  /**
   * Transforms message content through all registered plugin transformers.
   * Called by ChatAreaComponent before displaying a message.
   */
  async formatMessageContent(
    content: string,
    context: {
      id: string;
      channelId: string;
      authorUsername: string;
      authorId: string;
      createdAt: string;
      editedAt: string | null;
    }
  ): Promise<string> {
    return this.eventBus.applyContentTransformers(content, context);
  }
}
