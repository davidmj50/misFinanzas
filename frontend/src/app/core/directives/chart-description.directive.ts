import { DestroyRef, Directive, Renderer2, afterRenderEffect, inject, input } from '@angular/core';
import { ChartjsComponent } from '@coreui/angular-chartjs';

@Directive({ selector: 'c-chart[appChartDescription]' })
export class ChartDescriptionDirective {
  readonly appChartDescription = input.required<string>();
  private readonly chart = inject(ChartjsComponent);
  private readonly renderer = inject(Renderer2);

  constructor() {
    const themeObserver = new MutationObserver(() => this.refreshTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-coreui-theme'] });
    inject(DestroyRef).onDestroy(() => themeObserver.disconnect());
    afterRenderEffect({ write: () => {
      const canvas = this.chart.canvasElement()?.nativeElement;
      if (canvas) this.renderer.setAttribute(canvas, 'aria-label', this.appChartDescription());
    } });
  }

  private refreshTheme() {
    const instance = this.chart.chart;
    if (!instance) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--mf-muted').trim() || '#60708a';
    const line = styles.getPropertyValue('--mf-line').trim() || '#e3e9f2';
    for (const scale of Object.values(instance.options.scales ?? {})) {
      if (scale?.ticks) scale.ticks.color = text;
      if (scale?.grid) scale.grid.color = line;
      if (scale && 'border' in scale && scale.border) scale.border.color = line;
    }
    const legend = instance.options.plugins?.legend;
    if (legend && legend.labels) legend.labels.color = text;
    instance.update('none');
  }
}
