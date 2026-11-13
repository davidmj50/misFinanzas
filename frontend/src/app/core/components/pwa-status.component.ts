import { Component, inject } from '@angular/core';
import { PwaService } from '../services/pwa.service';
@Component({
  selector: 'app-pwa-status',
  template: `
    @if (!pwa.online()) { <div class="alert alert-warning rounded-0 mb-0 py-2 px-3" role="status">Sin conexión. El registro rápido conserva tu borrador; el guardado se confirma al reconectar.</div> }
    @if (pwa.updateReady() || pwa.updateRequired()) { <div class="alert alert-info rounded-0 mb-0 py-2 px-3 d-flex flex-wrap gap-2 align-items-center" role="status"><span>{{ pwa.updateRequired() ? 'Es necesario recargar MisFinanzas.' : 'Hay una nueva versión disponible.' }} Guarda los cambios antes de actualizar.</span><button class="btn btn-primary btn-sm" (click)="pwa.reload()">Actualizar aplicación</button></div> }
  `,
})
export class PwaStatusComponent { readonly pwa = inject(PwaService); }
