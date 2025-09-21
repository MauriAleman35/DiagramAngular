import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthModule } from './features/auth/auth.module';
import { MaterialModule } from '../material.module';
import { HTTP_INTERCEPTORS, HttpClient, HttpClientModule } from '@angular/common/http';
import { TokenInterceptor } from './core/token/token.interceptor';
import { SessionModule } from './features/session/session.module';
import { FormsModule } from '@angular/forms';
import { jwtDecode } from 'jwt-decode';


@NgModule({
  imports: [
    BrowserModule,
    AppRoutingModule,
    MaterialModule,   
    AuthModule,HttpClientModule,SessionModule,FormsModule
  ],
  providers: [
    {
      provide:HTTP_INTERCEPTORS,
      useClass:TokenInterceptor,
      multi:true
    }
  ],
  declarations: [AppComponent],
  bootstrap:    [AppComponent],
})
export class AppModule {}