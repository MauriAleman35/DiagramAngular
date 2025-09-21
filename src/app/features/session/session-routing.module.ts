import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { SidebarLayoutComponent } from "../../layout/sidebar-layout/sidebar-layout.component";
import { HostSessionsComponent } from "./pages/host-session/host-session.component";
import { CollaboratorSessionsComponent } from "./pages/collaborator-sessions/collaborator-sessions.component";
import { InviteCollaboratorsComponent } from "./pages/invite-collaborators/invite-collaborators.component";
import { MyInvitationsComponent } from "./pages/my-invitations/my-invitations.component";

const routes: Routes = [
  // 📦 Rutas con Sidebar
  {
    path: ':id',
    component: SidebarLayoutComponent,
    children: [
      { path: 'host', component: HostSessionsComponent },
      { path: 'collaborator', component: CollaboratorSessionsComponent },
      { path: 'invite', component: InviteCollaboratorsComponent },
      { path: 'my-invitations', component: MyInvitationsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'host' }
    ]
  },

  // 🎯 Ruta SIN layout (fuera del SidebarLayoutComponent)
  {
    path: ':id/diagram/:idSession',
    loadChildren: () =>
      import('../diagram/diagram.module').then((m) => m.DiagramModule),
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SessionRoutingModule {}
