export interface UserPostParams {
    name:     string;
    email:    string;
    password: string;
}

export interface UserPostResponse {
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
    userSessions: null;
    lock:         null;
    id:           number;
}
export interface GetUserByEmailResponse {
    statusCode: number;
    message:    string;
    data:       Data;
}

export interface Data {
    users: Users;
}
