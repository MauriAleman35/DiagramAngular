import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { UserPostParams } from '../../../../core/interfaces/user';

@Component({
  selector: 'app-auth-signup',
  standalone: false,
  templateUrl: './auth-signup.component.html',
  styleUrls: ['./auth-signup.component.css']
})
export class AuthSignupComponent {
  // UI state
  isLoading = false;
  hidePassword = true;
  hideConfirmPassword = true;
  errorMessage = '';
  successMessage = '';
  currentStep = 1;

  // Campos simples con ngModel
  name: string = '';
  email: string = '';
  phone: string = '';
  password: string = '';
  confirmPassword: string = '';
  acceptTerms: boolean = false;

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  onSignup(): void {
    this.errorMessage = '';
    this.successMessage = '';

    // Validaciones mínimas (puedes quitarlas si quieres aún más libre)
    if (!this.name || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Todos los campos obligatorios deben estar llenos.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      return;
    }
    if (!this.acceptTerms) {
      this.errorMessage = 'Debes aceptar los términos y condiciones.';
      return;
    }

    this.isLoading = true;

    const payload: UserPostParams = {
      name: this.name,
      email: this.email,
      password: this.password
    };

    this.auth.signUp(payload).subscribe({
      next: () => {
        this.successMessage = '¡Cuenta creada exitosamente! Redirigiendo al inicio de sesión...';
        this.currentStep = 3;
        setTimeout(() => this.router.navigate(['/auth/signin']), 1200);
      },
      error: (err) => {
        console.error('Signup error:', err);
        this.errorMessage = err?.error?.message ?? 'Error al crear la cuenta. Inténtalo de nuevo.';
      },
      complete: () => this.isLoading = false
    });
  }

  togglePasswordVisibility(): void { this.hidePassword = !this.hidePassword; }
  toggleConfirmPasswordVisibility(): void { this.hideConfirmPassword = !this.hideConfirmPassword; }
  goToLogin(): void { this.router.navigate(['/']); }
}
