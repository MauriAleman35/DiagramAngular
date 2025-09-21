import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SessionService } from '../../../../core/session/session.service';
import { GetSessionsByHostResponse } from '../../../../core/interfaces/session';
import { CreateInvitationPostParams } from '../../../../core/interfaces/invitation';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-invite-collaborators',
  standalone: false,
  templateUrl: './invite-collaborators.component.html',
  styleUrls: ['./invite-collaborators.component.css']
})
export class InviteCollaboratorsComponent implements OnInit {
  form = new FormGroup({
    sessionId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    email: new FormControl<string>('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  userId: number | null = null;
  sessions: GetSessionsByHostResponse[] = [];
  loading = false;

  constructor(
    private route: ActivatedRoute,
    private sessionService: SessionService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const id = this.route.parent?.snapshot.paramMap.get('id');
    if (id) {
      this.userId = Number(id);
      this.loadSessions();
    }
  }

  loadSessions() {
    if (!this.userId) return;
    this.sessionService.getSessionsHost(this.userId).subscribe({
      next: (res) => {
        this.sessions = res;
      }
    });
  }

  send() {
    if (this.form.invalid || !this.userId) return;

    this.loading = true;

    const { sessionId, email } = this.form.value;
    const sendInvitation: CreateInvitationPostParams = {
      idhost: this.userId,
      idSession: sessionId!,
      email: email!,
    };

    this.sessionService.createInvitation(sendInvitation).subscribe({
      next: (res) => {
        this.form.reset();
        this.snackBar.open('Invitación enviada correctamente', 'Cerrar', {
          duration: 3000,
          panelClass: ['snackbar-success']
        });
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Ocurrió un error al enviar la invitación', 'Cerrar', {
          duration: 3000,
          panelClass: ['snackbar-error']
        });
        this.loading = false;
      }
    });
  }
}
