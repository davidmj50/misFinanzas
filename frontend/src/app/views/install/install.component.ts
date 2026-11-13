import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PwaService } from '../../core/services/pwa.service';
@Component({
  selector: 'app-install', imports: [RouterLink],
  template: `
    <main class="container pwa-shell" style="max-width: 680px">
      <header class="d-flex gap-3 align-items-center mb-4"><img src="assets/pwa/icon-192.png" alt="" width="64" height="64" class="rounded-4" /><div><h1 class="h3 mb-1">MisFinanzas en tu celular</h1><p class="mb-0 text-body-secondary">Tus movimientos, a un toque de distancia.</p></div></header>
      <div class="card mb-3"><div class="card-body">
        @if (pwa.standalone()) { <p class="alert alert-success" role="status">MisFinanzas ya está abierta como aplicación o se añadió a tus aplicaciones.</p> }
        @else if (!pwa.secure) { <p class="alert alert-warning">Abre la dirección publicada con HTTPS para instalar MisFinanzas.</p> }
        @else if (pwa.canInstall()) { <button class="btn btn-primary btn-lg w-100 mb-3" [disabled]="pwa.installing()" (click)="pwa.install()">Instalar MisFinanzas</button> }
        <h2 class="h5">Añadir a la pantalla de inicio</h2>
        @if (pwa.ios) { <ol><li>Abre MisFinanzas en Safari.</li><li>Toca Compartir y elige <strong>Añadir a pantalla de inicio</strong>.</li><li>Activa <strong>Abrir como app web</strong> si aparece y toca <strong>Añadir</strong>.</li></ol> }
        @else { <ol><li>Abre MisFinanzas en Chrome o Edge.</li><li>Pulsa Instalar si aparece el botón, o abre el menú del navegador.</li><li>Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong> y confirma.</li></ol> }
        <p class="small text-body-secondary mb-0">Los nombres y la disponibilidad de estas opciones dependen del navegador. La instalación se confirma desde tu celular.</p>
      </div></div>
      <div class="card mb-3"><div class="card-body"><h2 class="h5">Registro rápido</h2><p>El icono abre un formulario con monto, cuenta, categoría, fecha y comercio. Puedes registrar un gasto o ingreso y acceder a los comprobantes.</p><a routerLink="/quick-entry" class="btn btn-primary">Abrir registro rápido</a></div></div>
      <div class="card mb-3"><div class="card-body"><h2 class="h5">Si se corta la conexión</h2><p>Una vez cargada, la aplicación puede abrir su interfaz sin conexión. El registro rápido conserva un borrador en este dispositivo y espera tu confirmación al reconectar. Los saldos y documentos requieren conexión.</p><p class="small text-body-secondary">El borrador pertenece a tu usuario. Cerrar sesión desde el menú lo elimina de este dispositivo.</p><button class="btn btn-outline-secondary" [disabled]="!pwa.online()" (click)="pwa.checkUpdates(true)">Buscar actualizaciones</button></div></div>
      @if (pwa.message()) { <p class="alert alert-info" role="status">{{ pwa.message() }}</p> }
      <a routerLink="/dashboard" class="me-3">Ir a MisFinanzas</a><a routerLink="/authentication/login">Iniciar sesión</a>
    </main>
  `,
})
export class InstallComponent { readonly pwa = inject(PwaService); }
