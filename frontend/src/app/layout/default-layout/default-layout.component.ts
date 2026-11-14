import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgScrollbar } from 'ngx-scrollbar';
import { AuthService } from '../../core/services/auth.service';

import {

  SidebarBrandComponent,
  SidebarComponent,
  SidebarFooterComponent,
  SidebarHeaderComponent,
  SidebarNavComponent,
  SidebarToggleDirective,
  SidebarTogglerDirective
} from '@coreui/angular';

import { DefaultFooterComponent, DefaultHeaderComponent } from './';
import { navItems } from './_nav';

@Component({
  selector: 'app-dashboard',
  templateUrl: './default-layout.component.html',
  styleUrls: ['./default-layout.component.scss'],
  imports: [
    SidebarComponent,
    SidebarHeaderComponent,
    SidebarBrandComponent,
    SidebarNavComponent,
    SidebarFooterComponent,
    SidebarToggleDirective,
    SidebarTogglerDirective,

    DefaultFooterComponent,
    DefaultHeaderComponent,

    NgScrollbar,
    RouterOutlet,
    RouterLink

  ]
})
export class DefaultLayoutComponent {
  private readonly authService = inject(AuthService);
  constructor() { this.authService.refreshUser().subscribe({ error: () => undefined }); }
  focusContent() { document.getElementById('main-content')?.focus(); }
  public navItems = navItems.filter((item) => item.url !== '/users' || this.authService.isAdmin());
}
