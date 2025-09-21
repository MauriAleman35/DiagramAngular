import { Injectable } from '@angular/core';
import { envUrl } from '../../environments/api';
import { HttpClient } from '@angular/common/http';
import { DiagramPostParams } from '../interfaces/diagram';
import { catchError, map, Observable, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DiagramService {
  ApiUrl=envUrl.url;

   constructor(private http:HttpClient) { }

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
  createDiagram(diagram:DiagramPostParams){
    return this.http.post(`${this.ApiUrl}/diagrams/create`,diagram);

  }
  updateDiagram(diagra:DiagramPostParams){
    const obj={
      data: diagra.data
    }
    return this.http.put(`${this.ApiUrl}/diagrams/update/${diagra.sessionId}`,obj);
  }
  exportBackend(idSession:number){
    return this.http.get(`${this.ApiUrl}/diagrams/export/${idSession}`,{responseType: 'blob'});
  }
}
