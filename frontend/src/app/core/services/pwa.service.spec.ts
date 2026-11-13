import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaService } from './pwa.service';
describe('Instalación y estado de la aplicación', () => {
  const setup = (enabled = false) => {
    const versions = new Subject<{ type: string }>(); const unrecoverable = new Subject<object>();
    const updates = { isEnabled: enabled, versionUpdates: versions, unrecoverable, checkForUpdate: vi.fn(() => Promise.resolve(false)) };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: updates }] });
    return { service: TestBed.inject(PwaService), updates, versions, unrecoverable };
  };
  it('espera al botón del usuario antes de abrir el diálogo de instalación', async () => {
    const { service } = setup(); const prompt = vi.fn(() => Promise.resolve());
    const event = new Event('beforeinstallprompt', { cancelable: true }); Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(service.canInstall()).toBe(true); expect(prompt).not.toHaveBeenCalled();
    await service.install(); expect(prompt).toHaveBeenCalledTimes(1); expect(service.canInstall()).toBe(false);
    await service.install(); expect(prompt).toHaveBeenCalledTimes(1);
  });
  it('respeta el rechazo de instalación y reconoce appinstalled', async () => {
    const { service } = setup(); const event = new Event('beforeinstallprompt'); Object.assign(event, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event); await service.install(); expect(service.message()).toContain('después');
    window.dispatchEvent(new Event('appinstalled')); expect(service.standalone()).toBe(true); expect(service.canInstall()).toBe(false);
  });
  it('refleja la pérdida y recuperación de conexión', () => {
    const { service } = setup(); window.dispatchEvent(new Event('offline')); expect(service.online()).toBe(false);
    window.dispatchEvent(new Event('online')); expect(service.online()).toBe(true);
  });
  it('avisa de una actualización y respeta el veto del borrador antes de recargar', () => {
    const { service, versions } = setup(true); versions.next({ type: 'VERSION_READY' }); expect(service.updateReady()).toBe(true);
    const block = (event: Event) => event.preventDefault(); window.addEventListener('misfinanzas:before-reload', block);
    try { service.reload(); expect(service.message()).toContain('borrador'); } finally { window.removeEventListener('misfinanzas:before-reload', block); }
  });
  it('no busca actualizaciones sin conexión y permite una comprobación manual', async () => {
    const { service, updates } = setup(true); window.dispatchEvent(new Event('offline')); await service.checkUpdates(true); expect(updates.checkForUpdate).not.toHaveBeenCalled();
    service.online.set(true); await service.checkUpdates(true); expect(updates.checkForUpdate).toHaveBeenCalledTimes(1); expect(service.message()).toContain('actualizada');
  });
});
