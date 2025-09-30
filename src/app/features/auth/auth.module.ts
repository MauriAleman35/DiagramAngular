

// Importa componentes


// Importa rutas hijas
import { CommonModule } from '@angular/common';
import { AuthRoutingModule } from './auth-routing.module';
import { AuthSigninComponent } from './pages/auth-signin/auth-signin.component';
import { AuthSignupComponent } from './pages/auth-signup/auth-signup.component';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';

// Material (AJUSTA esta ruta si estás fuera de `src/app`)


@NgModule({
  declarations: [
    AuthSigninComponent,
    AuthSignupComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AuthRoutingModule,
    MaterialModule,ReactiveFormsModule
  ]
})
export class AuthModule {}
