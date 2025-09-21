import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
;(globalThis as any).global = globalThis;
(window as any).process = (window as any).process || { env: {} };
platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));