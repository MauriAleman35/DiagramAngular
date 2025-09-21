import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { SessionRoutingModule } from "./session-routing.module";
import { AuthSigninComponent } from "../auth/pages/auth-signin/auth-signin.component";
import { HostSessionsComponent } from "./pages/host-session/host-session.component";
import { MaterialModule } from "../../../material.module";
import { InviteCollaboratorsComponent } from "./pages/invite-collaborators/invite-collaborators.component";
import { CollaboratorSessionsComponent } from "./pages/collaborator-sessions/collaborator-sessions.component";
import { FormGroup, FormsModule, NgModel, ReactiveFormsModule } from "@angular/forms";
import { MyInvitationsComponent } from "./pages/my-invitations/my-invitations.component";
import { SidebarLayoutComponent } from "../../layout/sidebar-layout/sidebar-layout.component";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { DiagramCreateDialogComponent } from "./components/diagram-create-dialog/diagram-create-dialog.component";


@NgModule({
     declarations: [
        HostSessionsComponent,InviteCollaboratorsComponent,CollaboratorSessionsComponent
        ,MyInvitationsComponent,SidebarLayoutComponent,DiagramCreateDialogComponent
      ],
    imports: [
        CommonModule,
        SessionRoutingModule,MaterialModule,ReactiveFormsModule, FormsModule
        ,MatFormFieldModule,MatInputModule,MatButtonModule,MatDialogModule
    ]
  })
  export class SessionModule { }