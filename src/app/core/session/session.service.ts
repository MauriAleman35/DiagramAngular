import { Injectable } from '@angular/core';
import { envUrl } from '../../environments/api';
import { HttpClient } from '@angular/common/http';
import { GetSessionsByCollaboratorResponse, GetSessionsByHostResponse, SessionParamsPost, SessionPostResponse } from '../interfaces/session';
import { Observable } from 'rxjs';
import { CreateInvitationPostParams, CreateInvitationResponse, GetInvitationPendientResponse, InvitationAcceptPostParams } from '../interfaces/invitation';


@Injectable({
  providedIn: 'root'
})
export class SessionService {
   ApiUrl=envUrl.url;
  constructor(private http:HttpClient) { }



  sessionCreate(session:SessionParamsPost):Observable<SessionPostResponse>{
    return this.http.post<SessionPostResponse>(`${this.ApiUrl}/session/create`,session);
  }

  getSessionsHost(idUser:number):Observable<GetSessionsByHostResponse[]>{
    return this.http.get<GetSessionsByHostResponse[]>(`${this.ApiUrl}/user-session/${idUser}/host-sessions`);

  }
   getSessionsCollaborator(idUser:number):Observable<GetSessionsByCollaboratorResponse[]>{
    return this.http.get<GetSessionsByCollaboratorResponse[]>(`${this.ApiUrl}/user-session/${idUser}/collaborator-sessions`);

  }

  getInvitationsPending(idUser:number):Observable<GetInvitationPendientResponse[]>{
    return this.http.get<GetInvitationPendientResponse[]>(`${this.ApiUrl}/user-session/${idUser}/pending-invitations`);
  }
   getInvitationsAccept(idUser:number):Observable<GetInvitationPendientResponse[]>{
    return this.http.get<GetInvitationPendientResponse[]>(`${this.ApiUrl}/user-session/${idUser}/accept-invitations`);
  }
  acceptInvitation(invitationsData:InvitationAcceptPostParams):Observable<any>{
    return this.http.post<any>(`${this.ApiUrl}/user-session/accept`,invitationsData);
    }

    createInvitation(invitationsData:CreateInvitationPostParams):Observable<CreateInvitationResponse>{
        return this.http.post<CreateInvitationResponse>(`${this.ApiUrl}/user-session/invite`,invitationsData);
    }
}
