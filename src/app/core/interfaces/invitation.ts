export interface InvitationAcceptPostParams {
    idSession:number;
    idCollaborator:number;
}

export interface CreateInvitationPostParams {
    idhost:    number;
    idSession: number;
    email:     string;
}


export interface CreateInvitationResponse {
    statusCode: number;
    message:    string;
    data:       Data;
}

export interface Data {
    users: Users;
}

export interface Users {
    email:        string;
    name:         string;
    password:     string;
    userSessions: any[];
    lock:         any[];
    id:           number;
}
export interface GetInvitationPendientResponse {
    id:      number;
    status:  string;
    role:    string;
    user:    User;
    session: Session;
}

export interface Session {
    id:           number;
    name:         string;
    description:  string;
    createdAt:    Date;
    userSessions: any[];
    diagrams:     any[];
}

export interface User {
    email:        string;
    name:         string;
    password:     string;
    userSessions: any[];
    lock:         any[];
    id:           number;
}
