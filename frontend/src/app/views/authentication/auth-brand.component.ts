import { Component } from '@angular/core';

@Component({
  selector: 'app-auth-brand',
  template: `
    <div class="brand-lockup">
      <img src="assets/pwa/icon-192.png" width="44" height="44" alt="" />
      <div class="brand-copy"><strong>MisFinanzas</strong><small>Control financiero, a tu manera</small></div>
    </div>
    <div class="auth-brand-content">
      <span class="eyebrow">Un espacio para tus finanzas</span>
      <h2>Más claridad hoy.<br /><span>Mejores planes mañana.</span></h2>
      <p>Reúne tus cuentas, organiza tus movimientos y encuentra el equilibrio para tus próximos objetivos.</p>
      <ul class="auth-benefits">
        <li><span class="auth-check" aria-hidden="true">✓</span> Tus cuentas y movimientos, en un solo lugar</li>
        <li><span class="auth-check" aria-hidden="true">✓</span> Presupuestos y metas que puedes seguir</li>
        <li><span class="auth-check" aria-hidden="true">✓</span> Una visión más clara de tus próximos pagos</li>
      </ul>
    </div>
    <p class="auth-brand-footer">Organiza tu presente. Dale espacio a lo que viene.</p>
  `,
})
export class AuthBrandComponent {}
