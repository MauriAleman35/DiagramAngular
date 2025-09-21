import { Component } from '@angular/core';

@Component({
  selector: 'app-auth-signup',
  standalone: false,
  templateUrl: './auth-signup.component.html',
  styleUrl: './auth-signup.component.css'
})
export class AuthSignupComponent {
  // Propiedades del formulario
  fullName: string = '';
  email: string = '';
  phone: string = '';
  password: string = '';
  confirmPassword: string = '';
  acceptTerms: boolean = false;
  
  // Estados del formulario
  hidePassword: boolean = true;
  hideConfirmPassword: boolean = true;
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  currentStep: number = 1;

  async onSignup(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      console.log('Crear cuenta con:', {
        fullName: this.fullName,
        email: this.email,
        phone: this.phone,
        password: this.password
      });
      
      await this.simulateSignup();
      
      this.successMessage = '¡Cuenta creada exitosamente! Redirigiendo...';
      this.currentStep = 3;
      
      setTimeout(() => {
        console.log('Redirigiendo al login...');
      }, 2000);

    } catch (error) {
      this.errorMessage = 'Error al crear la cuenta. Por favor, inténtalo de nuevo.';
      console.error('Error en signup:', error);
    } finally {
      this.isLoading = false;
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }

  goToLogin(): void {
    console.log('Ir a login');
    // Navegar a página de login
  }

  getProgressPercentage(): number {
    return (this.currentStep / 3) * 100;
  }

  getPasswordStrength(): 'weak' | 'medium' | 'strong' {
    if (!this.password) return 'weak';
    
    let score = 0;
    
    // Longitud
    if (this.password.length >= 8) score++;
    if (this.password.length >= 12) score++;
    
    // Complejidad
    if (/[a-z]/.test(this.password)) score++;
    if (/[A-Z]/.test(this.password)) score++;
    if (/\d/.test(this.password)) score++;
    if (/[@$!%*?&]/.test(this.password)) score++;
    
    if (score <= 2) return 'weak';
    if (score <= 4) return 'medium';
    return 'strong';
  }

  getPasswordStrengthPercentage(): number {
    const strength = this.getPasswordStrength();
    switch (strength) {
      case 'weak': return 33;
      case 'medium': return 66;
      case 'strong': return 100;
      default: return 0;
    }
  }

  getPasswordStrengthText(): string {
    const strength = this.getPasswordStrength();
    switch (strength) {
      case 'weak': return 'Débil';
      case 'medium': return 'Media';
      case 'strong': return 'Fuerte';
      default: return '';
    }
  }

  private validateForm(): boolean {
    if (!this.fullName || !this.email || !this.phone || !this.password || !this.confirmPassword) {
      this.errorMessage = 'Por favor completa todos los campos';
      return false;
    }

    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden';
      return false;
    }

    if (!this.acceptTerms) {
      this.errorMessage = 'Debes aceptar los términos y condiciones';
      return false;
    }

    return true;
  }

  private simulateSignup(): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simular validación de email único
        if (this.email === 'test@test.com') {
          reject(new Error('Email already exists'));
        } else {
          resolve();
        }
      }, 2000);
    });
  }
}