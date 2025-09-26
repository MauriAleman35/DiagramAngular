import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { envUrl } from '../../environments/api';
import { AiDiagramRequest, AiDiagramResponse, DiagramPostParams } from '../interfaces/diagram';
import { catchError, map, Observable, of, throwError, tap } from 'rxjs'; // 👈 agrega tap

@Injectable({ providedIn: 'root' })
export class DiagramService {
  ApiUrl = envUrl.url;

  constructor(private http: HttpClient) {}

  getDiagramBySession(sessionId: number): Observable<any | null> {
    return this.http.get<any>(`${this.ApiUrl}/diagrams/session/${sessionId}`).pipe(
      map(res => res?.data ?? res ?? null),
      catchError(err => {
        if (err.status === 404 || err.status === 204) return of(null);
        if (err.status === 500) return of(null);
        return throwError(() => err);
      })
    );
  }

  createDiagram(diagram: DiagramPostParams) {
    return this.http.post(`${this.ApiUrl}/diagrams/create`, diagram);
  }

  updateDiagram(diagram: DiagramPostParams) {
    const obj = { data: diagram.data };
    return this.http.put(`${this.ApiUrl}/diagrams/update/${diagram.sessionId}`, obj);
  }

  /* =======================
   * EXPORTS
   * ======================= */

  exportBackend(sessionId: number): Observable<void> {
    const url = `${this.ApiUrl}/diagrams/export/${sessionId}`;
    return this.http.get(url, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(
      tap((res: HttpResponse<Blob>) => {
        const cd = res.headers.get('Content-Disposition');
        const parsed = this.parseFilenameFromDisposition(cd);
        const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const fallback = `jhipster_backend_session_${sessionId}_${ts}.zip`;
        this.downloadBlobResponse(res, parsed ?? fallback);
      }),
      map(() => void 0)
    );
  }

  exportXmi(sessionId: number): Observable<void> {
    const url = `${this.ApiUrl}/diagrams/export-xmi/${sessionId}`;
    return this.http.get(url, {
      observe: 'response',
      responseType: 'blob'
    }).pipe(
      tap((res: HttpResponse<Blob>) => {
        const cd = res.headers.get('Content-Disposition');
        const parsed = this.parseFilenameFromDisposition(cd) ?? `diagram_session_${sessionId}.xmi`;
        const filename = parsed.toLowerCase().endsWith('.xmi') ? parsed : `${parsed}.xmi`;
        const blob = res.body instanceof Blob ? res.body : new Blob([res.body as any], { type: 'application/xml' });
        this.triggerDownload(blob, filename);
      }),
      map(() => void 0)
    );
  }

  /* ===== Helpers descarga ===== */

  private parseFilenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const m1 = /filename\*=(?:UTF-8''|)([^;]+)/i.exec(disposition);
    if (m1?.[1]) return decodeURIComponent(m1[1].replace(/"/g, '').trim());
    const m2 = /filename=(.*?)(?:;|$)/i.exec(disposition);
    if (m2?.[1]) return m2[1].replace(/"/g, '').trim();
    return null;
  }

  private downloadBlobResponse(res: HttpResponse<Blob>, filename: string): void {
    const blob = res.body instanceof Blob ? res.body : new Blob([res.body as any]);
    this.triggerDownload(blob, filename);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }


  applyInstruction(sessionId: number, req: AiDiagramRequest): Observable<AiDiagramResponse> {
    return this.http.post<AiDiagramResponse>(`${this.ApiUrl}/ai/diagram/apply/${sessionId}`, req);
  }
}
