export interface LoginResponse {
    statusCode: number;
    message:    string;
    data:       Data;
}

export interface Data {
    token:       string;
    userDetails: UserDetails;
}

export interface UserDetails {
    enabled:               boolean;
    password:              string;
    username:              string;
    authorities:           any[];
    accountNonExpired:     boolean;
    credentialsNonExpired: boolean;
    accountNonLocked:      boolean;
}


export interface loginParams{
    email:string;
    password:string;
}