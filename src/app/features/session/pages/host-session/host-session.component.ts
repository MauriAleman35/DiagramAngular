import { Component, OnInit } from '@angular/core';
import { SessionService } from '../../../../core/session/session.service';
import { ActivatedRoute, Router } from '@angular/router';
import { GetSessionsByHostResponse } from '../../../../core/interfaces/session';

interface HostSession {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  lastActivity: string;
  collaborators: number;
  tables: number;
  type: 'active' | 'paused';
}

@Component({
  selector: 'app-host-sessions',
  standalone: false,
  templateUrl: './host-session.component.html',
  styleUrls: ['./host-session.component.css']
})
export class HostSessionsComponent implements OnInit {

  searchTerm: string = '';
  sessions: GetSessionsByHostResponse[] = [];
  filteredSessions: GetSessionsByHostResponse[] = [];
  constructor(private sessionService:SessionService,
     private route:ActivatedRoute, private navRoute:Router) {}


  ngOnInit(): void {
  const userId = this.route.parent?.snapshot.paramMap.get('id');
    if (!userId) return;
  this.navRoute.events.subscribe(() => {
    this.loadSessions();
  });
    
}

loadSessions() {
     const userId = this.route.parent?.snapshot.paramMap.get('id');
    if (!userId) return;
this.sessionService.getSessionsHost(Number(userId)).subscribe({
       next: (res) => {
      this.sessions = res;
      this.filteredSessions = [...res]; 
        console.log(this.sessions);
      },
    error: (err) => console.error('Error al cargar sesiones:', err)
  });
}

  onSearch() {
    const term = this.searchTerm.toLowerCase().trim();
    
    if (!term) {
      this.filteredSessions = [...this.sessions];
      return;
    }

    this.filteredSessions = this.sessions.filter(session =>
      session.name.toLowerCase().includes(term) ||
      session.description.toLowerCase().includes(term)
    );
  }

  openSession(sessionId: number ){
      this.navRoute.navigate([`/session/${this.route.parent?.snapshot.paramMap.get('id')}/diagram/${sessionId}`])
    // Aquí implementarás la navegación al editor
  }

  manageCollaborators(sessionId: number) {
    console.log('Gestionar colaboradores:', sessionId);
    // Aquí implementarás la gestión de colaboradores
  }

  duplicateSession(sessionId: number) {
    console.log('Duplicar sesión:', sessionId);
    // Aquí implementarás la duplicación
  }

  exportSession(sessionId: number) {
    console.log('Exportar sesión:', sessionId);
    // Aquí implementarás la exportación
  }

  archiveSession(sessionId: number) {
    console.log('Archivar sesión:', sessionId);
    // Aquí implementarás el archivado
  }
}