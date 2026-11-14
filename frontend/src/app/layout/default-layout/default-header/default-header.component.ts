import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BreadcrumbRouterComponent, ColorModeService, ContainerComponent, DropdownComponent, DropdownDividerDirective, DropdownHeaderDirective, DropdownItemDirective, DropdownMenuDirective, DropdownToggleDirective, HeaderComponent, HeaderNavComponent, HeaderTogglerDirective, SidebarToggleDirective } from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-default-header', templateUrl: './default-header.component.html',
  imports: [RouterLink, BreadcrumbRouterComponent, ContainerComponent, DropdownComponent, DropdownDividerDirective, DropdownHeaderDirective, DropdownItemDirective, DropdownMenuDirective, DropdownToggleDirective, HeaderNavComponent, HeaderTogglerDirective, IconDirective, NgTemplateOutlet, SidebarToggleDirective],
})
export class DefaultHeaderComponent extends HeaderComponent {
  private readonly modeService = inject(ColorModeService);
  private readonly auth = inject(AuthService);
  readonly colorMode = this.modeService.colorMode;
  readonly currentUser = this.auth.currentUser;
  readonly initials = computed(() => (this.currentUser()?.name ?? 'Mi cuenta').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase());
  readonly colorModes = [
    { name: 'light', text: 'Claro', icon: 'cilSun' },
    { name: 'dark', text: 'Oscuro', icon: 'cilMoon' },
    { name: 'auto', text: 'Según el dispositivo', icon: 'cilContrast' },
  ];
  readonly icons = computed(() => this.colorModes.find(mode => mode.name === this.colorMode())?.icon ?? 'cilSun');
  readonly sidebarId = input('sidebar1');
  logout() { this.auth.logout(); }
}
