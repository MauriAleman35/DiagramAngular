import { Component, OnInit } from '@angular/core';
import { SessionService } from '../../../../core/session/session.service';
import { ActivatedRoute } from '@angular/router';
import { GetInvitationPendientResponse, InvitationAcceptPostParams } from '../../../../core/interfaces/invitation';

@Component({
  selector: 'app-my-invitations',
  standalone: false,
  templateUrl: './my-invitations.component.html',
  styleUrls: ['./my-invitations.component.css']
})
export class MyInvitationsComponent implements  OnInit{
  invitations:GetInvitationPendientResponse[] = [];
  invitationsAccepted:GetInvitationPendientResponse[] = [];
  constructor(private sessionService:SessionService, private route:ActivatedRoute) {}
  ngOnInit(): void {
     this.loadInvitations();
  }
  private loadInvitations(): void {
    const userId = this.route.parent?.snapshot.paramMap.get('id');
    if (!userId) return;

    this.sessionService.getInvitationsPending(Number(userId)).subscribe({
      next: (res) => {
        this.invitations = res;

      }
      
    });
    this.sessionService.getInvitationsAccept(Number(userId)).subscribe({
      next: (res) => {
        this.invitationsAccepted = res;

      }
    })

  }
  acceptInvitation(idUser:number, idSession:number) {
    const objectAccept:InvitationAcceptPostParams={
      idSession: idSession,
      idCollaborator: idUser

    }
    this.sessionService.acceptInvitation(objectAccept).subscribe({
      next: () => {
       this.loadInvitations(); // Recargar las invitaciones después de aceptar
       }
    });
    
  }

  get pendingInvitations() {
    return this.invitations.filter(inv=>inv.status==="PENDING");
  }

  get acceptedInvitations() {
    console.log(this.invitationsAccepted.filter(inv => inv.status === 'ACCEPTED'),"aceptadooo");
    return this.invitationsAccepted.filter(inv => inv.status === 'ACCEPTED');
    
  }
}
