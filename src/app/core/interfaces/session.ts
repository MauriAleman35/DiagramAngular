export interface SessionParamsPost {
    name:        string;
    description: string;
    idHost:      number;
}

export interface SessionPostResponse {
    statusCode: number;
    message:    string;
    data:       Data;
}

export interface Data {
    session: Session;
}

export interface Session {
    id:           number;
    name:         string;
    description:  string;
    createdAt:    Date;
    userSessions: null;
    diagrams:     null;
}

export interface GetSessionsByHostResponse {
    id:           number;
    name:         string;
    description:  string;
    createdAt:    Date;
    userSessions: any[];
    diagrams:     any[];
}

export interface GetSessionsByCollaboratorResponse {
    id:           number;
    name:         string;
    description:  string;
    createdAt:    Date;
    userSessions: any[];
    diagrams:     any[];
}
