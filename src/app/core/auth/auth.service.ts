import { Injectable } from '@angular/core';
import { envUrl } from '../../environments/api';
import { HttpClient } from '@angular/common/http';
import { loginParams, LoginResponse } from '../interfaces/auth';
import { GetUserByEmailResponse, UserPostParams, UserPostResponse } from '../interfaces/user';
import { jwtDecode } from 'jwt-decode';
@Injectable({
  providedIn: 'root'
})
export class AuthService {
   ApiUrl=envUrl.url;
  constructor(private http:HttpClient) { }

  signIn(credentials:loginParams){
    return this.http.post<LoginResponse>(`${this.ApiUrl}/auth/login`,credentials)
  }
  signUp(user:UserPostParams){
    return this.http.post<UserPostResponse>(`${this.ApiUrl}/auth/addUser`,user);
  }
  getUserByEmail(email:string){
    return this.http.get<GetUserByEmailResponse>(`${this.ApiUrl}/user/byEmail`,{
      params:{email}
    });
  }
  isLogined():boolean{
    return !!localStorage.getItem('auth_token');
  }
  Logout():void{
    localStorage.removeItem('auth_token');

  }
  getDecodedToken(): any {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;

    try {
      return jwtDecode(token);
    } catch (e) {
      return null;
    }
  }

  getUserEmail(): string | null {
    const decoded = this.getDecodedToken();
    console.log('Decoded token:', decoded);
    return decoded?.sub ?? null; // o decoded?.sub si usás 'sub' como ID
  }
}
