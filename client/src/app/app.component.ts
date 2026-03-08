import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PluginLoaderService } from './services/plugin-loader.service';
import { InviteDeepLinkService } from './services/invite-deep-link.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly pluginLoader = inject(PluginLoaderService);
  private readonly inviteDeepLink = inject(InviteDeepLinkService);

  ngOnInit(): void {
    this.pluginLoader.initialize();
    this.inviteDeepLink.init();
  }
}
