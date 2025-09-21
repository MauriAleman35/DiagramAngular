import { Component, OnInit } from '@angular/core';
import { GetSessionsByCollaboratorResponse } from '../../../../core/interfaces/session';
import { SessionService } from '../../../../core/session/session.service';
import { ActivatedRoute, Router } from '@angular/router';


@Component({
  selector: 'app-collaborator-sessions',
  standalone: false,
  templateUrl: './collaborator-sessions.component.html',
  styleUrls: ['./collaborator-sessions.component.css']
})
export class CollaboratorSessionsComponent implements OnInit {
  searchTerm: string = '';
  sessions: GetSessionsByCollaboratorResponse[] = [];
  filteredSessions: GetSessionsByCollaboratorResponse[] = [];
  constructor(private sessionService:SessionService, private route:ActivatedRoute, private navRoute:Router) {}
  ngOnInit() {
      const userId = this.route.parent?.snapshot.paramMap.get('id');
      if (!userId) return;
      this.sessionService.getSessionsCollaborator(Number(userId)).subscribe({
        next: (res) => {
          this.sessions = res;
          this.filteredSessions=[...res]
        },error: (err) => console.error('Error al cargar sesiones:', err)
      })


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

  joinSession(sessionId: number) {
      this.navRoute.navigate([`/session/${this.route.parent?.snapshot.paramMap.get('id')}/diagram/${sessionId}`])
    // Aquí implementarás la lógica para unirse a la sesión
  }

  viewDetails(sessionId: number) {
    console.log('Ver detalles de sesión:', sessionId);
    // Aquí implementarás la navegación a detalles
  }
}