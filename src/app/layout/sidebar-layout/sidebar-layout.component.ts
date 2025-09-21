import { Component, OnDestroy, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { DiagramCreateDialogComponent } from '../../features/session/components/diagram-create-dialog/diagram-create-dialog.component';
import { SessionParamsPost } from '../../core/interfaces/session';
import { SessionService } from '../../core/session/session.service';

@Component({
  selector: 'app-sidebar-layout',
  standalone: false,
  templateUrl: './sidebar-layout.component.html',
  styleUrls: ['./sidebar-layout.component.css']
})
export class SidebarLayoutComponent implements OnInit, OnDestroy {

  title = 'Sesiones';
  nav: Array<{ label: string; link: string; icon: string }> = [];
  isMobile = false;
  sidebarOpen = false;
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
    private authService:AuthService,
    private dialog:MatDialog,
    private sessionService:SessionService
  ) {}

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  ngOnInit(): void {
  // Obtener el ID desde la ruta padre
  const userId = this.route.snapshot.paramMap.get('id');

  this.nav = [
    { label: 'Sesiones como anfitrión', link: `/session/${userId}/host`, icon: 'workspace_premium' },
    { label: 'Sesiones como colaborador', link: `/session/${userId}/collaborator`, icon: 'group' },
    { label: 'Invitar colaboradores', link: `/session/${userId}/invite`, icon: 'person_add' },
    { label: 'Invitaciones propias', link: `/session/${userId}/my-invitations`, icon: 'mail' },
  ];

  this.router.events
    .pipe(filter(e => e instanceof NavigationEnd), takeUntil(this.destroy$))
    .subscribe(() => {
      const child = this.route.firstChild?.snapshot;
      this.title = (child?.data?.['title']) ?? 'Sesiones';
    });

  this.checkScreenSize();
}

  private checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.sidebarOpen = false; // En desktop no necesitamos estado abierto
    }
  }

  toggleSidebar(): void {
    if (this.isMobile) {
      this.sidebarOpen = !this.sidebarOpen;
    }
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  logout(): void {
    this.authService.Logout();
    this.router.navigate(['/']);


  }
  onNavClick(): void {
    // Cerrar sidebar en móvil cuando se hace clic en navegación
    if (this.isMobile) {
      this.sidebarOpen = false;
    }
  }

  createSession(): void {
    const idHost=Number(this.route.snapshot.paramMap.get('id'));

    const dialogRef=this.dialog.open(DiagramCreateDialogComponent,{
      width: '400px',
      data: { idHost }
    });
dialogRef.afterClosed().subscribe((result: SessionParamsPost | undefined) => {
      if (result) {
        this.sessionService.sessionCreate(result).subscribe(() => {
          // Redirigir al host para refrescar
          this.router.navigate([], { relativeTo: this.route });
        });
      }
    });

  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}