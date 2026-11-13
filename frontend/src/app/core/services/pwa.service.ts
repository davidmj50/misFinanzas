import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private promptEvent: InstallPrompt | null = null;
  private lastCheck = 0;
  readonly online = signal(navigator.onLine);
  readonly standalone = signal(window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  readonly canInstall = signal(false);
  readonly installing = signal(false);
  readonly updateReady = signal(false);
  readonly updateRequired = signal(false);
  readonly message = signal('');
  readonly secure = window.isSecureContext;
  readonly ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  constructor() {
    const listen = (name: string, handler: EventListener) => { window.addEventListener(name, handler); this.destroyRef.onDestroy(() => window.removeEventListener(name, handler)); };
    listen('online', () => { this.online.set(true); void this.checkUpdates(); }); listen('offline', () => this.online.set(false));
    listen('beforeinstallprompt', event => { event.preventDefault(); this.promptEvent = event as InstallPrompt; this.canInstall.set(true); });
    listen('appinstalled', () => { this.standalone.set(true); this.canInstall.set(false); this.promptEvent = null; this.message.set('MisFinanzas se añadió a tus aplicaciones.'); });
    const display = window.matchMedia('(display-mode: standalone)');
    const modeChanged = () => this.standalone.set(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    display.addEventListener('change', modeChanged); this.destroyRef.onDestroy(() => display.removeEventListener('change', modeChanged));
    const visible = () => { if (document.visibilityState === 'visible') void this.checkUpdates(); };
    document.addEventListener('visibilitychange', visible); this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', visible));
    if (this.updates?.isEnabled) {
      this.updates.versionUpdates.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => { if (event.type === 'VERSION_READY') this.updateReady.set(true); });
      this.updates.unrecoverable.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateRequired.set(true));
    }
  }
  async install() {
    if (!this.promptEvent || this.installing()) return;
    const event = this.promptEvent; this.promptEvent = null; this.canInstall.set(false); this.installing.set(true); this.message.set('');
    try { await event.prompt(); const choice = await event.userChoice; this.message.set(choice.outcome === 'accepted' ? 'Confirma la instalación en tu navegador y abre MisFinanzas desde su icono.' : 'Puedes instalarla después desde el menú del navegador.'); }
    catch { this.message.set('No se pudo abrir la instalación. Usa el menú del navegador.'); }
    finally { this.installing.set(false); }
  }
  async checkUpdates(manual = false) {
    if (!this.updates?.isEnabled || !this.online() || (!manual && Date.now() - this.lastCheck < 5 * 60 * 1000)) return;
    this.lastCheck = Date.now();
    try { const found = await this.updates.checkForUpdate(); if (manual && !found) this.message.set('MisFinanzas está actualizada.'); }
    catch { if (manual) this.message.set('No se pudo comprobar la actualización. Revisa tu conexión.'); }
  }
  reload() {
    if (!window.dispatchEvent(new Event('misfinanzas:before-reload', { cancelable: true }))) { this.message.set('No se pudo conservar el borrador. Guarda tus datos antes de actualizar.'); return; }
    window.location.reload();
  }
}
